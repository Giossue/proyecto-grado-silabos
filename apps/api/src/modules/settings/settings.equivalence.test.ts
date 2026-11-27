// @vitest-environment node
import type { NestExpressApplication } from "@nestjs/platform-express"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import golden from "../../server/http/__fixtures__/laravel-golden.json"
import { fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionPayload, type FakeWorld } from "../../server/auth/testing"
import type { BridgeDeps } from "../../server/auth/types"
import { createRateLimiter, type RateLimiter } from "../../server/http/throttle"
import { unmatchedRoute } from "../../server/http/router"
import settingsGolden from "../../server/operations/__fixtures__/system-settings-golden.json"
import { showSystemSettings, SECRET, type SettingsEnvironment } from "../../server/operations/systemSettings"
import { testSystemSettings, updateSystemSettings, type SettingRow, type SystemSettingsWriteDeps } from "../../server/operations/systemSettingsWrites"
import { AUTH_BRIDGE, RATE_LIMITER } from "../auth/auth.tokens"
import { bothSides, equivalenceApp, type Answer, type Call } from "../processes/testing"
import { SettingsModule } from "./settings.module"
import { SettingsRepository } from "./settings.repository"
import { CONNECTION_FETCH, LIBRARY_DIRECTORY, PASSWORD_VERIFIER, SETTINGS_ENVIRONMENT } from "./settings.tokens"

const PASSWORD = "Secreta-2026"
const BASE = "/api/v1/admin/system-settings"
const ENVIRONMENT: SettingsEnvironment = {
  NOTIFICATION_EMAILS: "true",
  NOTIFICATION_DIGEST_TIME: "08:00",
  AI_DRIVER: "deepseek",
  AI_BASE_URL: "https://api.deepseek.com",
  AI_MODEL: "deepseek-chat",
  AI_API_KEY: "clave-entorno",
  AI_CONNECT_TIMEOUT: "2",
  AI_TIMEOUT: "50",
  CATALOG_DRIVER: "koha",
  KOHA_BASE_URL: "https://biblioteca.ueb.edu.ec",
}

type State = {
  world: FakeWorld
  stored: Map<string, unknown>
  environment: SettingsEnvironment
  writes: (SettingRow & { actorId: string; at: number })[]
  fetched: string[]
  fetchResult: () => Promise<Response>
  libraries: () => Promise<unknown[]>
  limiter: RateLimiter
  bridge: BridgeDeps
}

let scenario: (state: State) => void = () => undefined
let state: State

function freshWorld(role = "administrador"): FakeWorld {
  return {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role, careerId: role === "administrador" ? null : "c-1", careerLabel: role === "administrador" ? null : "Software" })],
  }
}

function freshState(): State {
  const world = freshWorld()
  const base: State = {
    world,
    stored: new Map(),
    environment: { ...ENVIRONMENT },
    writes: [],
    fetched: [],
    fetchResult: async () => new Response("{}", { status: 200 }),
    libraries: async () => [{ code: "BC" }, { code: "BG" }],
    limiter: createRateLimiter(),
    bridge: fakeDeps(world),
  }
  scenario(base)
  base.bridge = fakeDeps(base.world)
  return base
}

const repository = {
  stored: async () => new Map(state.stored),
  save: async (rows: SettingRow[], actorId: string, at: number) => {
    for (const row of rows) {
      state.writes.push({ ...row, actorId, at })
      state.stored.set(row.field, row.value)
    }
  },
}

const verifyPassword = async (plain: string) => plain === PASSWORD
const connectionFetch = async (url: string) => {
  state.fetched.push(url)
  return state.fetchResult()
}
const libraries = () => state.libraries()
const environment = () => state.environment

const bridge: BridgeDeps = {
  store: { findUser: (id) => state.bridge.store.findUser(id), effectiveRoleAssignments: (id) => state.bridge.store.effectiveRoleAssignments(id) },
  sessions: {
    fromWebApp: (request) => state.bridge.sessions.fromWebApp(request),
    resolve: (request) => state.bridge.sessions.resolve(request),
    find: (token) => state.bridge.sessions.find(token),
    setActiveRole: (session, id) => state.bridge.sessions.setActiveRole(session, id),
    revokeUser: (id) => state.bridge.sessions.revokeUser(id),
  },
  config: fakeDeps({ sessions: new Map(), users: [], assignments: [] }).config,
  now: () => NOW,
}

const limiter: RateLimiter = {
  attempt: (key, max, decay, now) => state.limiter.attempt(key, max, decay, now),
  attempts: (key, now) => state.limiter.attempts(key, now),
}

function deps(): SystemSettingsWriteDeps {
  return { bridge: state.bridge, limiter: state.limiter, stored: repository.stored, environment, verifyPassword, save: repository.save, fetch: connectionFetch, libraries }
}

const SECTIONS = ["notificaciones", "ia", "biblioteca", "asistente-docente"]
const TESTABLE = ["ia", "biblioteca"]

async function legacy(web: Request): Promise<Response> {
  const { pathname } = new URL(web.url)
  if (pathname === BASE) return web.method === "GET" ? showSystemSettings(web, { bridge: state.bridge, stored: repository.stored, environment }) : unmatchedRoute(web)
  const parts = pathname.startsWith(`${BASE}/`) ? pathname.slice(BASE.length + 1).split("/") : []
  const section = decodeURIComponent(parts[0] ?? "")
  if (parts.length === 1 && web.method === "PUT") return SECTIONS.includes(section) ? updateSystemSettings(web, section, deps()) : unmatchedRoute(web)
  if (parts.length === 2 && parts[1] === "test" && web.method === "POST") return TESTABLE.includes(section) ? testSystemSettings(web, section, deps()) : unmatchedRoute(web)
  return unmatchedRoute(web)
}

const sealed = (row: SettingRow) => (row.field === SECRET && typeof row.value === "string" ? { ...row, value: `cifrado:${row.value.length > 0}` } : row)
const effects = () => ({
  writes: state.writes.map(sealed),
  fetched: state.fetched,
  sessions: [...state.world.sessions.values()].map((item) => item.payload),
})

let app: NestExpressApplication

async function expectSame(...calls: Call[]): Promise<Answer[]> {
  const { legacy: before, nest: after } = await bothSides({ reset: () => void (state = freshState()), legacy, effects, app: () => app }, calls)
  expect(after).toEqual(before)
  return after
}

beforeAll(async () => {
  app = await equivalenceApp(SettingsModule, [
    [AUTH_BRIDGE, bridge],
    [RATE_LIMITER, limiter],
    [SettingsRepository, repository],
    [SETTINGS_ENVIRONMENT, environment],
    [PASSWORD_VERIFIER, verifyPassword],
    [CONNECTION_FETCH, connectionFetch],
    [LIBRARY_DIRECTORY, libraries],
  ])
})

afterAll(async () => {
  await app?.close()
})

beforeEach(() => {
  scenario = () => undefined
})

const statuses = (answers: Answer[]) => answers.map((answer) => answer.status)

describe("system settings served by Nest answer exactly like the route handlers they replace", () => {
  it("shows the settings with their source the same way", async () => {
    scenario = (current) => void current.stored.set("notifications.digest_time", "06:15")
    const [answer] = await expectSame({ method: "GET", path: BASE })
    expect(JSON.parse(answer.body).notifications.digest_time).toEqual({ value: "06:15", source: "pantalla" })
  })

  it("answers a guest, an unverified user, a user without role and a non administrator the same way", async () => {
    const answers = [...(await expectSame({ method: "GET", path: BASE, cookie: false }, { method: "PUT", path: `${BASE}/ia`, body: {}, cookie: false }))]
    scenario = (current) => void (current.world.users = [makeUser({ emailVerifiedAt: null })])
    answers.push(...(await expectSame({ method: "GET", path: BASE }, { method: "PUT", path: `${BASE}/notificaciones`, body: {} })))
    scenario = (current) => void (current.world.assignments = [])
    answers.push(...(await expectSame({ method: "GET", path: BASE }, { method: "POST", path: `${BASE}/ia/test` })))
    scenario = (current) => void (current.world = freshWorld("docente"))
    answers.push(...(await expectSame({ method: "GET", path: BASE }, { method: "PUT", path: `${BASE}/biblioteca`, body: {} }, { method: "POST", path: `${BASE}/biblioteca/test` })))
    expect(statuses(answers)).toEqual([401, 401, 403, 403, 409, 409, 403, 403, 403])
  })

  it.each(settingsGolden.validation.map((sample, index) => [index, sample] as const))("saves or rejects the golden case %i the same way", async (_, sample) => {
    const [answer] = await expectSame({ method: "PUT", path: `${BASE}/${sample.section}`, body: sample.input })
    expect(answer.status).toBe(sample.settings === null ? 422 : 200)
  })

  it("encrypts a new AI key, clears it and fails with a list as password the same way", async () => {
    const answers = await expectSame(
      { method: "PUT", path: `${BASE}/ia`, body: { current_password: PASSWORD, driver: "deepseek", base_url: "https://api.deepseek.com/", model: "deepseek-chat", api_key: "nueva", connect_timeout: 3, timeout: 40 } },
      { method: "PUT", path: `${BASE}/ia`, body: { current_password: PASSWORD, driver: "disabled", clear_api_key: true, connect_timeout: 3, timeout: 40 } },
      { method: "PUT", path: `${BASE}/biblioteca`, body: { current_password: ["x"], driver: "koha", base_url: "https://b.ueb.edu.ec" } },
      { method: "PUT", path: `${BASE}/biblioteca`, body: { current_password: "otra", driver: "koha", base_url: "https://b.ueb.edu.ec" } },
    )
    expect(statuses(answers)).toEqual([200, 200, 500, 422])
  })

  it("saves and rejects the teacher assistant switch the same way", async () => {
    const answers = await expectSame({ method: "PUT", path: `${BASE}/asistente-docente`, body: { enabled: true } }, { method: "PUT", path: `${BASE}/asistente-docente`, body: {} }, { method: "GET", path: BASE })
    expect(statuses(answers)).toEqual([200, 422, 200])
    expect(JSON.parse(answers[2].body).teacher_assistant).toEqual({ enabled: { value: true, source: "pantalla" } })
    scenario = (current) => void (current.world = freshWorld("docente"))
    expect(statuses(await expectSame({ method: "PUT", path: `${BASE}/asistente-docente`, body: { enabled: true } }))).toEqual([403])
  })

  it("tests the AI provider and the library catalog with the same answers", async () => {
    const answers = [...(await expectSame({ method: "POST", path: `${BASE}/ia/test` }, { method: "POST", path: `${BASE}/biblioteca/test` }))]
    scenario = (current) => {
      current.fetchResult = async () => new Response("{}", { status: 401 })
      current.libraries = async () => Promise.reject(new Error("caído"))
    }
    answers.push(...(await expectSame({ method: "POST", path: `${BASE}/ia/test` }, { method: "POST", path: `${BASE}/biblioteca/test` })))
    scenario = (current) => void (current.environment = { ...ENVIRONMENT, AI_DRIVER: "disabled", CATALOG_DRIVER: "disabled" })
    answers.push(...(await expectSame({ method: "POST", path: `${BASE}/ia/test` }, { method: "POST", path: `${BASE}/biblioteca/test` })))
    expect(statuses(answers)).toEqual([200, 200, 200, 200, 200, 200])
    expect(JSON.parse(answers[2].body)).toEqual({ ok: false, message: "El proveedor no aceptó la clave" })
  })

  it("throttles changes and tests after 10 a minute the same way", async () => {
    const calls: Call[] = Array.from({ length: 10 }, (_, index) => (index % 2 === 0 ? { method: "PUT", path: `${BASE}/notificaciones`, body: { emails: true, digest_time: "07:00" } } : { method: "POST", path: `${BASE}/ia/test` }))
    const answers = await expectSame(...calls, { method: "PUT", path: `${BASE}/notificaciones`, body: {} })
    expect(answers.at(-1)?.status).toBe(429)
    expect(answers[0].headers["x-ratelimit-remaining"]).toBe("9")
  })

  it.each([
    ["PUT", `${BASE}/otra`],
    ["POST", `${BASE}/notificaciones/test`],
    ["POST", `${BASE}/asistente-docente/test`],
    ["GET", `${BASE}/asistente-docente`],
    ["POST", `${BASE}/otra/test`],
    ["GET", `${BASE}/ia`],
    ["DELETE", `${BASE}/ia`],
    ["GET", `${BASE}/ia/test`],
    ["POST", BASE],
    ["OPTIONS", BASE],
  ])("answers %s %s with the router answer of the contract", async (method, path) => {
    await expectSame({ method, path, cookie: false })
    await expectSame({ method, path })
  })
})
