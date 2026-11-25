// @vitest-environment node
import "reflect-metadata"
import { Test } from "@nestjs/testing"
import type { NestExpressApplication } from "@nestjs/platform-express"
import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import golden from "../../server/http/__fixtures__/laravel-golden.json"
import { fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../../server/auth/testing"
import type { BridgeDeps } from "../../server/auth/types"
import { createRateLimiter, type RateLimiter } from "../../server/http/throttle"
import { showEmailPreferences, updateEmailPreferences } from "../../server/operations/emailPreferences"
import type { DestinationLookups } from "../../server/operations/notificationDestination"
import { listNotifications, markAllNotificationsRead, markNotificationRead, openNotification, type NotificationRecord, type StoredNotification } from "../../server/operations/notifications"
import { unmatchedRoute } from "../../server/http/router"
import { configureApi } from "../../bootstrap"
import { WebResponseExpressAdapter } from "../../common/http/web-response.adapter"
import { PrismaService } from "../../prisma/prisma.service"
import { AuthModule } from "../auth/auth.module"
import { AUTH_BRIDGE, RATE_LIMITER } from "../auth/auth.tokens"
import { FallbackModule } from "../fallback/fallback.module"
import { NotificationDestinationsRepository } from "./notification-destinations.repository"
import { NotificationsModule } from "./notifications.module"
import { NotificationsRepository } from "./notifications.repository"

const SESSION_ID = golden.sessionId
const COOKIE = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const OWN = "0b3f1c6e-1d2a-4c55-9b1e-1a2b3c4d5e6f"
const FOREIGN = "0b3f1c6e-1d2a-4c55-9b1e-1a2b3c4d5e70"
const MISSING = "0b3f1c6e-1d2a-4c55-9b1e-1a2b3c4d5e71"
const OTHER_USER = "c0000000-0000-4000-8000-000000000009"
const TEACHER = golden.roleId
const COORDINATOR = "a0000000-0000-4000-8000-000000000002"
const HEADERS = ["content-type", "cache-control", "allow", "x-ratelimit-limit", "x-ratelimit-remaining", "retry-after", "x-ratelimit-reset", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy", "content-security-policy", "cross-origin-resource-policy"]

type Stored = StoredNotification & { visible: boolean; title: string; notifiedAt: string }

type State = {
  world: FakeWorld
  stored: Stored[]
  writes: string[]
  lookups: DestinationLookups
  limiter: RateLimiter
  bridge: BridgeDeps
}

type Call = { method: string; path: string; body?: unknown; cookie?: boolean; headers?: Record<string, string> }

type Answer = { status: number; body: string; headers: Record<string, string | null>; writes: string[]; sessions: string[] }

function notice(overrides: Partial<Stored> = {}): Stored {
  return {
    id: OWN,
    userId: golden.userId,
    type: "convocatoria.abierta",
    resourceType: "convocatoria",
    resourceId: "conv-1",
    readAt: null,
    visible: true,
    title: "Convocatoria abierta",
    notifiedAt: "2026-11-23T15:04:05+00:00",
    ...overrides,
  }
}

let scenario: () => Partial<State> = () => ({})
let state: State

function freshState(): State {
  const world = freshStateWorld()
  const base: State = {
    world,
    stored: [notice(), notice({ id: FOREIGN, userId: OTHER_USER }), notice({ id: "0b3f1c6e-1d2a-4c55-9b1e-1a2b3c4d5e72", type: "documento.exportacion_fallida", resourceType: "artefacto_exportacion", resourceId: "x", readAt: "2026-11-20T10:00:00+00:00", notifiedAt: "2026-11-22T10:00:00+00:00" })],
    writes: [],
    lookups: {
      processCareerIds: async () => [],
      convocationCareerIds: async (id) => (id === "conv-1" ? ["career-1"] : []),
      syllabusExists: async () => false,
      syllabusCareerId: async () => null,
      latestRevisionId: async () => null,
      teacherAssignmentIds: async () => [],
      artifactRevision: async () => null,
    },
    limiter: createRateLimiter(),
    bridge: fakeDeps(world),
  }
  const merged = { ...base, ...scenario() }
  merged.bridge = fakeDeps(merged.world)
  return merged
}

const records = (userId: string, onlyUnread: boolean): NotificationRecord[] =>
  state.stored
    .filter((item) => item.userId === userId && item.visible && (!onlyUnread || item.readAt === null))
    .map((item) => ({ id: item.id, type: item.type, title: item.title, message: `Mensaje de ${item.id}.`, resourceType: item.resourceType, resourceId: item.resourceId, readAt: item.readAt, notifiedAt: item.notifiedAt }))

const repository = {
  async page(userId: string, { page, perPage, onlyUnread }: { page: number; perPage: number; onlyUnread: boolean }) {
    const visible = records(userId, onlyUnread)
    return { total: visible.length, items: visible.slice((page - 1) * perPage, page * perPage) }
  },
  async unreadCount(userId: string) {
    return records(userId, true).length
  },
  async find(id: string) {
    state.writes.push(`find:${id}`)
    const found = state.stored.find((item) => item.id === id)
    return found ? { id: found.id, userId: found.userId, type: found.type, resourceType: found.resourceType, resourceId: found.resourceId, readAt: found.readAt } : null
  },
  async markRead(id: string, at: number) {
    state.writes.push(`read:${id}:${at}`)
    const item = state.stored.find((candidate) => candidate.id === id)
    if (item) item.readAt = String(at)
  },
  async markAllRead(userId: string, at: number) {
    state.writes.push(`read-all:${userId}:${at}`)
    for (const item of state.stored) if (item.userId === userId && item.visible && item.readAt === null) item.readAt = String(at)
  },
  async saveEmailPreferences(userId: string, preferences: Record<string, unknown>) {
    state.writes.push(`preferences:${userId}:${JSON.stringify(preferences)}`)
  },
}

const lookups: DestinationLookups = {
  processCareerIds: (id) => state.lookups.processCareerIds(id),
  convocationCareerIds: (id) => state.lookups.convocationCareerIds(id),
  syllabusExists: (id) => state.lookups.syllabusExists(id),
  syllabusCareerId: (id) => state.lookups.syllabusCareerId(id),
  latestRevisionId: (id) => state.lookups.latestRevisionId(id),
  teacherAssignmentIds: (id, user) => state.lookups.teacherAssignmentIds(id, user),
  artifactRevision: (id) => state.lookups.artifactRevision(id),
}

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

function headersOf(call: Call): Record<string, string> {
  return {
    accept: "application/json",
    referer: "http://localhost:3000/notificaciones",
    ...(call.cookie === false ? {} : { cookie: COOKIE }),
    ...(call.body === undefined ? {} : { "content-type": "application/json" }),
    ...call.headers,
  }
}

async function answerOf(response: Response): Promise<Omit<Answer, "writes" | "sessions">> {
  return { status: response.status, body: await response.text(), headers: Object.fromEntries(HEADERS.map((name) => [name, response.headers.get(name)])) }
}

const PARAMETER = /^\/api\/v1\/notifications\/([^/]+)\/(read|open)$/

async function legacy(call: Call): Promise<Response> {
  const url = new URL(call.path, "http://localhost:3000")
  const web = new Request(url, { method: call.method, headers: headersOf(call), body: call.body === undefined ? undefined : JSON.stringify(call.body) })
  const writeDeps = { bridge: state.bridge, notifications: repository, lookups: state.lookups }
  const parameter = PARAMETER.exec(url.pathname)
  if (url.pathname === "/api/v1/notifications" && call.method === "GET") return listNotifications(web, { bridge: state.bridge, notifications: repository, lookups: state.lookups })
  if (url.pathname === "/api/v1/notifications/read-all" && call.method === "POST") return markAllNotificationsRead(web, writeDeps)
  if (parameter && call.method === "POST") return parameter[2] === "read" ? markNotificationRead(web, decodeURIComponent(parameter[1]), writeDeps) : openNotification(web, decodeURIComponent(parameter[1]), writeDeps)
  if (url.pathname === "/api/v1/notifications/email-preferences" && call.method === "GET") return showEmailPreferences(web, { bridge: state.bridge })
  if (url.pathname === "/api/v1/notifications/email-preferences" && call.method === "PUT") {
    return updateEmailPreferences(web, { bridge: state.bridge, limiter: state.limiter, preferences: { save: (userId, preferences) => repository.saveEmailPreferences(userId, preferences) } })
  }
  return unmatchedRoute(web)
}

let app: NestExpressApplication

async function nest(call: Call): Promise<Omit<Answer, "writes" | "sessions">> {
  const server = request(app.getHttpServer())
  let pending = server[call.method.toLowerCase() as "get"](call.path)
  for (const [name, value] of Object.entries({ ...headersOf(call), "x-forwarded-host": "localhost:3000" })) pending = pending.set(name, value)
  const response = await (call.body === undefined ? pending : pending.send(JSON.stringify(call.body)))
  return { status: response.status, body: response.text ?? "", headers: Object.fromEntries(HEADERS.map((name) => [name, (response.headers[name] as string | undefined) ?? null])) }
}

async function both(...calls: Call[]): Promise<{ legacy: Answer[]; nest: Answer[] }> {
  const run = async (send: (call: Call) => Promise<Omit<Answer, "writes" | "sessions">>) => {
    state = freshState()
    const answers: Answer[] = []
    for (const call of calls) {
      const answer = await send(call)
      answers.push({ ...answer, writes: [...state.writes], sessions: [...state.world.sessions.values()].map((record) => record.payload) })
    }
    return answers
  }
  return { legacy: await run(async (call) => answerOf(await legacy(call))), nest: await run(nest) }
}

async function expectSame(...calls: Call[]): Promise<Answer[]> {
  const { legacy: before, nest: after } = await both(...calls)
  expect(after).toEqual(before)
  return after
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AuthModule, NotificationsModule, FallbackModule] })
    .overrideProvider(AUTH_BRIDGE)
    .useValue(bridge)
    .overrideProvider(RATE_LIMITER)
    .useValue(limiter)
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(NotificationsRepository)
    .useValue(repository)
    .overrideProvider(NotificationDestinationsRepository)
    .useValue(lookups)
    .compile()
  app = moduleRef.createNestApplication<NestExpressApplication>(new WebResponseExpressAdapter(), { bodyParser: false })
  configureApi(app)
  await app.init()
})

afterAll(async () => {
  await app?.close()
})

beforeEach(() => {
  scenario = () => ({})
})

describe("notifications served by Nest answer exactly like the route handlers they replace", () => {
  it("lists the notices with the same JSON, links and unread count", async () => {
    const [answer] = await expectSame({ method: "GET", path: "/api/v1/notifications" })
    expect(answer.status).toBe(200)
    expect(JSON.parse(answer.body).notifications.path).toBe("http://localhost:3000/api/v1/notifications")
  })

  it.each([
    ["the unread filter", "/api/v1/notifications?status=unread"],
    ["a blank filter, which means all", "/api/v1/notifications?status=%20"],
    ["an unknown filter", "/api/v1/notifications?status=archived"],
    ["a filter sent as a list", "/api/v1/notifications?status[]=unread"],
    ["a list after a valid filter", "/api/v1/notifications?status=unread&status[0]=x"],
    ["an unclosed bracket", "/api/v1/notifications?status[x=1"],
    ["the second page with other parameters", "/api/v1/notifications?page=2&sort=x"],
    ["a page that is not a number", "/api/v1/notifications?page=abc"],
  ])("answers %s the same way", async (_, path) => {
    await expectSame({ method: "GET", path })
  })

  it("answers a guest, an unverified user and an inactive account the same way", async () => {
    await expectSame({ method: "GET", path: "/api/v1/notifications", cookie: false })
    await expectSame({ method: "GET", path: "/api/v1/notifications", headers: { referer: "http://evil.test/" } })
    scenario = () => {
      const world = freshStateWorld()
      world.users = [makeUser({ emailVerifiedAt: null })]
      return { world }
    }
    await expectSame({ method: "GET", path: "/api/v1/notifications" }, { method: "POST", path: `/api/v1/notifications/${OWN}/read` }, { method: "PUT", path: "/api/v1/notifications/email-preferences", body: { preferences: { "silabo.aprobado": false } } })
    scenario = () => {
      const world = freshStateWorld()
      world.users = [makeUser({ active: false })]
      return { world }
    }
    await expectSame({ method: "GET", path: "/api/v1/notifications" })
  })

  it("marks one, opens one and marks all with the same writes and answers", async () => {
    const answers = await expectSame(
      { method: "POST", path: `/api/v1/notifications/${OWN}/read` },
      { method: "POST", path: `/api/v1/notifications/${OWN}/open` },
      { method: "POST", path: "/api/v1/notifications/read-all" },
      { method: "GET", path: "/api/v1/notifications" },
    )
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200, 200])
  })

  it("opens a notice of another role and switches the active role the same way", async () => {
    const [answer] = await expectSame({ method: "POST", path: `/api/v1/notifications/${OWN}/open` })
    expect(JSON.parse(answer.body)).toMatchObject({ role_changed: true })
  })

  it("answers a notice without a screen, a foreign one, a missing one and a malformed id the same way", async () => {
    scenario = () => ({ stored: [notice({ type: "aviso.sin_pantalla", resourceType: null, resourceId: null }), notice({ id: FOREIGN, userId: OTHER_USER })] })
    const answers = await expectSame(
      { method: "POST", path: `/api/v1/notifications/${OWN}/open` },
      { method: "POST", path: `/api/v1/notifications/${FOREIGN}/read` },
      { method: "POST", path: `/api/v1/notifications/${FOREIGN}/open` },
      { method: "POST", path: `/api/v1/notifications/${MISSING}/read` },
      { method: "POST", path: "/api/v1/notifications/no-es-uuid/open" },
    )
    expect(answers.map((answer) => answer.status)).toEqual([200, 403, 403, 404, 404])
  })

  it("shows and saves the email notices with the same answers", async () => {
    const answers = await expectSame(
      { method: "GET", path: "/api/v1/notifications/email-preferences" },
      { method: "PUT", path: "/api/v1/notifications/email-preferences", body: { preferences: { "silabo.aprobado": false, "biblioteca.verificado": "1" } } },
    )
    expect(answers[1].headers["x-ratelimit-remaining"]).toBe("19")
  })

  it.each([
    ["no preferences", {}],
    ["an empty list", { preferences: {} }],
    ["a text", { preferences: "si" }],
    ["false", { preferences: false }],
    ["a bad switch and a notice of another role", { preferences: { "silabo.aprobado": "quizas", "administracion.otro": true } }],
    ["only a notice of another role", { preferences: { "administracion.otro": true } }],
    ["a list of switches", { preferences: [true, "x"] }],
  ])("rejects %s with the same 422", async (_, body) => {
    const [answer] = await expectSame({ method: "PUT", path: "/api/v1/notifications/email-preferences", body })
    expect(answer.status).toBe(422)
  })

  it("throttles the email notices after 20 changes a minute the same way", async () => {
    const calls = Array.from({ length: 21 }, () => ({ method: "PUT", path: "/api/v1/notifications/email-preferences", body: { preferences: { "silabo.aprobado": true } } }))
    const answers = await expectSame(...calls)
    expect(answers.at(-1)?.status).toBe(429)
  })

  it.each([
    ["POST", "/api/v1/notifications"],
    ["DELETE", "/api/v1/notifications"],
    ["GET", "/api/v1/notifications/read-all"],
    ["PATCH", `/api/v1/notifications/${OWN}/read`],
    ["GET", `/api/v1/notifications/${OWN}/open`],
    ["DELETE", "/api/v1/notifications/email-preferences"],
    ["OPTIONS", "/api/v1/notifications"],
    ["GET", "/api/v1/notifications/otra-cosa"],
  ])("answers %s %s with the router answer of the contract", async (method, path) => {
    await expectSame({ method, path, cookie: false })
  })
})

function freshStateWorld(): FakeWorld {
  return {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes({ active_role_assignment_id: COORDINATOR })), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ id: TEACHER, role: "docente", careerId: "career-1" }), makeAssignment({ id: COORDINATOR, role: "coordinador", careerId: "career-2", careerLabel: "Medicina" })],
  }
}
