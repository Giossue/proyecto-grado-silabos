// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { activeSessions, type SessionRow } from "./sessions"

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const OTHER = "b".repeat(40)
const STRANGER = "c".repeat(40)

let world: FakeWorld
let devices: Map<string, { userId: string; ip: string | null; agent: string | null }>
let log: string[]

const store = {
  async sessions(userId: string): Promise<SessionRow[]> {
    log.push("list")
    return [...world.sessions.entries()]
      .filter(([id]) => devices.get(id)?.userId === userId)
      .map(([id, row]) => ({ id, ip: devices.get(id)!.ip, agent: devices.get(id)!.agent, lastActivity: row.lastActivity }))
      .sort((left, right) => right.lastActivity - left.lastActivity)
  },
}

function deps() {
  const bridge = fakeDeps(world, [])
  const touch = bridge.store.touchSession
  bridge.store = {
    ...bridge.store,
    touchSession: async (id, lastActivity) => {
      log.push(`touch:${lastActivity}`)
      await touch(id, lastActivity)
    },
  }
  return { bridge, store }
}

beforeEach(() => {
  log = []
  world = {
    sessions: new Map([
      [golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW - 600 }],
      [OTHER, { payload: "", lastActivity: NOW - 60 }],
      [STRANGER, { payload: "", lastActivity: NOW - 5 }],
    ]),
    users: [makeUser({ emailVerifiedAt: null })],
    assignments: [makeAssignment()],
  }
  devices = new Map([
    [golden.sessionId, { userId: golden.userId, ip: "10.0.0.8", agent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36" }],
    [OTHER, { userId: golden.userId, ip: null, agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" }],
    [STRANGER, { userId: "someone-else", ip: "10.0.0.9", agent: "curl/8.0" }],
  ])
})

describe("GET authentication/sessions", () => {
  it("lists the user's sessions newest first with the current one as Laravel read it before refreshing it", async () => {
    const response = await activeSessions(apiRequest("/api/v1/authentication/sessions", { cookie }), deps())
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(
      JSON.stringify({
        sessions: [
          { id: OTHER, ip_address: null, device: "Safari en iOS", last_activity: "2027-01-15T07:59:00+00:00", current: false },
          { id: golden.sessionId, ip_address: "10.0.0.8", device: "Chrome en Linux", last_activity: "2027-01-15T07:50:00+00:00", current: true },
        ],
      }),
    )
    expect(log).toEqual(["list", `touch:${NOW}`])
    expect(world.sessions.get(golden.sessionId)?.lastActivity).toBe(NOW)
  })

  it("names unknown browsers and platforms like Laravel", async () => {
    devices.set(OTHER, { userId: golden.userId, ip: "10.0.0.7", agent: "Mozilla/5.0 (Windows NT 10.0) Edg/120.0 Chrome/120.0" })
    world.sessions.delete(golden.sessionId)
    world.sessions.set(golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW - 600 })
    devices.set(golden.sessionId, { userId: golden.userId, ip: null, agent: null })
    const body = JSON.parse(await (await activeSessions(apiRequest("/api/v1/authentication/sessions", { cookie }), deps())).text()) as { sessions: { device: string }[] }
    expect(body.sessions.map((session) => session.device)).toEqual(["Edge en Windows", "Navegador desconocido en dispositivo desconocido"])
  })

  it("answers 401 without a session and lists nothing", async () => {
    const response = await activeSessions(apiRequest("/api/v1/authentication/sessions"), deps())
    expect(response.status).toBe(401)
    expect(log).toEqual([])
  })
})
