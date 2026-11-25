// @vitest-environment node
import type { NestExpressApplication } from "@nestjs/platform-express"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import golden from "../../server/http/__fixtures__/laravel-golden.json"
import { fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionPayload, type FakeWorld } from "../../server/auth/testing"
import type { BridgeDeps } from "../../server/auth/types"
import { createRateLimiter, type RateLimiter } from "../../server/http/throttle"
import { unmatchedRoute } from "../../server/http/router"
import { availableScreenHelp, showScreenHelp } from "../../server/operations/screenHelp"
import { AUTH_BRIDGE, RATE_LIMITER } from "../auth/auth.tokens"
import { bothSides, equivalenceApp, type Answer, type Call } from "../processes/testing"
import { HelpModule } from "./help.module"

type State = { world: FakeWorld; limiter: RateLimiter; bridge: BridgeDeps }

let role: string | null = "administrador"
let verified = true
let state: State

function freshState(): State {
  const world: FakeWorld = {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser(verified ? {} : { emailVerifiedAt: null })],
    assignments: role === null ? [] : [makeAssignment({ role, careerId: role === "administrador" || role === "bibliotecario" ? null : "c-1" })],
  }
  return { world, limiter: createRateLimiter(), bridge: fakeDeps(world) }
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

async function legacy(web: Request): Promise<Response> {
  const { pathname } = new URL(web.url)
  if (pathname === "/api/v1/help" && web.method === "GET") return showScreenHelp(web, { bridge: state.bridge })
  if (pathname === "/api/v1/help/available" && web.method === "GET") return availableScreenHelp(web, { bridge: state.bridge })
  return unmatchedRoute(web)
}

let app: NestExpressApplication

async function expectSame(...calls: Call[]): Promise<Answer[]> {
  const effects = () => ({ sessions: [...state.world.sessions.values()].map((item) => item.payload) })
  const { legacy: before, nest: after } = await bothSides({ reset: () => void (state = freshState()), legacy, effects, app: () => app }, calls)
  expect(after).toEqual(before)
  return after
}

beforeAll(async () => {
  app = await equivalenceApp(HelpModule, [
    [AUTH_BRIDGE, bridge],
    [RATE_LIMITER, limiter],
  ])
})

afterAll(async () => {
  await app?.close()
})

beforeEach(() => {
  role = "administrador"
  verified = true
})

describe("screen help served by Nest answers exactly like the route handlers it replaces", () => {
  it.each([
    ["a known screen", "/api/v1/help?screen=/admin/convocatorias"],
    ["a screen without help", "/api/v1/help?screen=/admin/nada"],
    ["no screen", "/api/v1/help"],
    ["a blank screen", "/api/v1/help?screen=%20"],
    ["a screen with forbidden characters", "/api/v1/help?screen=/Admin%20x"],
    ["a screen sent as a list", "/api/v1/help?screen[]=/admin"],
    ["a screen too long", `/api/v1/help?screen=/${"a".repeat(160)}`],
    ["a screen sent in a JSON body", "/api/v1/help?screen=/admin/convocatorias"],
  ])("answers %s the same way", async (name, path) => {
    const call: Call = name.includes("JSON") ? { method: "GET", path, headers: { "content-type": "application/json" } } : { method: "GET", path }
    await expectSame(call)
  })

  it.each(["administrador", "coordinador", "docente", "bibliotecario"])("lists the help available to the %s the same way", async (current) => {
    role = current
    const [answer] = await expectSame({ method: "GET", path: "/api/v1/help/available" })
    expect(JSON.parse(answer.body).help.length).toBeGreaterThan(0)
  })

  it("answers a guest, an unverified user and a user without role the same way", async () => {
    const calls: Call[] = [
      { method: "GET", path: "/api/v1/help?screen=/admin" },
      { method: "GET", path: "/api/v1/help/available" },
    ]
    const answers = [...(await expectSame(...calls.map((call) => ({ ...call, cookie: false }))))]
    verified = false
    answers.push(...(await expectSame(...calls)))
    verified = true
    role = null
    answers.push(...(await expectSame(...calls)))
    expect(answers.map((answer) => answer.status)).toEqual([401, 401, 403, 403, 409, 409])
  })

  it.each([
    ["POST", "/api/v1/help"],
    ["PUT", "/api/v1/help/available"],
    ["OPTIONS", "/api/v1/help"],
    ["GET", "/api/v1/help/otra"],
  ])("answers %s %s with the router answer of the contract", async (method, path) => {
    await expectSame({ method, path, cookie: false })
  })
})
