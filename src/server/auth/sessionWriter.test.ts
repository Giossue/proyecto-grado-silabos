// @vitest-environment node
import { describe, expect, it } from "vitest"
import golden from "./__fixtures__/session-golden.json"
import { decrypt } from "../http/encrypter"
import { cookiePrefix } from "../http/cookies"
import {
  clientIp,
  invalidateSession,
  sessionRandom,
  regenerateSession,
  saveSession,
  sessionCookie,
  sessionJson,
  setCookieHeader,
  startSession,
  xsrfCookie,
  type SessionWriterDeps,
} from "./sessionWriter"
import { fakeDeps, NOW, storedJson, testKey, type FakeWorld } from "./testing"

type Tree = Record<string, unknown>

function put(tree: Tree, path: string, value: unknown): void {
  const keys = path.split(".")
  let node = tree
  for (const key of keys.slice(0, -1)) {
    if (typeof node[key] !== "object" || node[key] === null || Array.isArray(node[key])) node[key] = {}
    node = node[key] as Tree
  }
  node[keys[keys.length - 1]] = value
}

function forget(tree: Tree, paths: string[]): void {
  for (const path of paths) {
    const keys = path.split(".")
    let node: unknown = tree
    for (const key of keys.slice(0, -1)) node = typeof node === "object" && node !== null ? (node as Tree)[key] : undefined
    if (typeof node === "object" && node !== null) delete (node as Tree)[keys[keys.length - 1]]
  }
}

function writer(world: FakeWorld, overrides: Partial<SessionWriterDeps> = {}): SessionWriterDeps {
  let counter = 0
  return {
    ...fakeDeps(world),
    cookie: { path: "/", domain: null, secure: false, sameSite: "lax" },
    random: (length) => `${String.fromCharCode(65 + counter++)}`.repeat(length),
    lottery: () => false,
    ...overrides,
  }
}

const emptyWorld = (): FakeWorld => ({ sessions: new Map(), users: [], assignments: [] })
const request = (headers: Record<string, string> = {}) => new Request("http://localhost:3000/api/v1/session", { headers })

describe("session JSON, against Laravel's Store", () => {
  for (const { name, operations, json } of golden.cases) {
    it(`writes the same JSON as Laravel: ${name}`, () => {
      let attributes: Tree = {}
      for (const operation of operations as unknown[][]) {
        if (operation[0] === "put") put(attributes, operation[1] as string, operation[2])
        if (operation[0] === "forget") forget(attributes, operation[1] as string[])
        if (operation[0] === "flush") attributes = {}
        if (operation[0] === "save") attributes = JSON.parse(sessionJson(attributes))
      }
      expect(sessionJson(attributes)).toBe(json)
    })
  }

  it("reads the sessions Laravel encrypted", async () => {
    const world = emptyWorld()
    for (const { payload, json } of golden.cases) {
      world.sessions.set(golden.sessionId, { payload, lastActivity: NOW })
      const state = await startSession(golden.laravelSessionCookie, writer(world))
      expect(state).toEqual({ id: golden.sessionId, attributes: JSON.parse(json), exists: true })
    }
  })
})

describe("session cookies, against Symfony's Cookie", () => {
  it("formats both cookies exactly like the PHP side", () => {
    for (const cookie of golden.cookies) {
      const options = { path: "/", domain: null, secure: false, sameSite: "lax" }
      expect(setCookieHeader(cookie.name, cookie.value, options, cookie.expires, cookie.httpOnly, cookie.expires - 14400)).toBe(cookie.header)
    }
  })

  it("encrypts the session id and the CSRF token with the cookie prefix", async () => {
    const state = await startSession(undefined, writer(emptyWorld()))
    const deps = writer(emptyWorld())
    for (const [header, name, value] of [
      [sessionCookie(state, deps), "silabos-ueb-session", state.id],
      [xsrfCookie(state, deps), "XSRF-TOKEN", state.attributes._token],
    ] as const) {
      const encrypted = decodeURIComponent(header.slice(name.length + 1, header.indexOf(";")))
      expect(decrypt(encrypted, testKey, false)).toBe(cookiePrefix(name, testKey) + value)
      expect(header.slice(header.indexOf(";"))).toBe(
        `; expires=${new Date((NOW + 7200) * 1000).toUTCString()}; Max-Age=7200; path=/${name === "XSRF-TOKEN" ? "" : "; httponly"}; samesite=lax`,
      )
    }
  })
})

describe("session lifecycle", () => {
  it("draws 40-character alphanumeric ids like Str::random", () => {
    for (let i = 0; i < 50; i += 1) expect(sessionRandom(40)).toMatch(/^[A-Za-z0-9]{40}$/)
  })

  it("starts a new session with a token when there is no cookie, and keeps a well-formed unknown id like Laravel", async () => {
    const fresh = await startSession(undefined, writer(emptyWorld()))
    expect(fresh).toEqual({ id: "A".repeat(40), attributes: { _token: "B".repeat(40) }, exists: false })
    const kept = await startSession(golden.laravelSessionCookie, writer(emptyWorld()))
    expect(kept.id).toBe(golden.sessionId)
    expect(kept.exists).toBe(false)
  })

  it("keeps the row of an expired session but starts it empty, like the database handler", async () => {
    const world = emptyWorld()
    world.sessions.set(golden.sessionId, { payload: golden.cases[1].payload, lastActivity: NOW - 7201 })
    const state = await startSession(golden.laravelSessionCookie, writer(world))
    expect(state).toEqual({ id: golden.sessionId, attributes: { _token: "A".repeat(40) }, exists: true })
  })

  it("inserts a new row with the user, IP and agent, and updates it afterwards", async () => {
    const world = emptyWorld()
    const deps = writer(world)
    const state = await startSession(undefined, deps)
    await saveSession(state, request({ "x-forwarded-for": "::1", "user-agent": "Prueba/1.0" }), null, deps)
    expect(world.sessions.get(state.id)).toMatchObject({ lastActivity: NOW, userId: null, ipAddress: "::1", userAgent: "Prueba/1.0" })
    state.attributes.extra = "x"
    await saveSession(state, request(), "u-1", deps)
    expect(world.sessions.get(state.id)).toMatchObject({ userId: "u-1", ipAddress: null, userAgent: "" })
    expect(storedJson(world, state.id)).toBe(`{"_token":"${"B".repeat(40)}","_flash":{"old":[],"new":[]},"extra":"x"}`)
  })

  it("regenerates without deleting the old row, and invalidates by deleting it", async () => {
    const world = emptyWorld()
    const deps = writer(world)
    const state = await startSession(undefined, deps)
    await saveSession(state, request(), null, deps)
    const first = state.id
    await regenerateSession(state, deps)
    await saveSession(state, request(), null, deps)
    expect([...world.sessions.keys()]).toEqual([first, state.id])
    expect(state.attributes._token).toBe("D".repeat(40))
    const second = state.id
    await invalidateSession(state, deps)
    expect(state.attributes).toEqual({})
    expect(world.sessions.has(second)).toBe(false)
    expect(world.sessions.has(first)).toBe(true)
  })

  it("collects expired rows only when the lottery hits", async () => {
    const { collectGarbage } = await import("./sessionWriter")
    const world = emptyWorld()
    world.sessions.set("old", { payload: "", lastActivity: NOW - 7200 })
    world.sessions.set("live", { payload: "", lastActivity: NOW - 7199 })
    await collectGarbage(writer(world))
    expect(world.sessions.size).toBe(2)
    await collectGarbage(writer(world, { lottery: () => true }))
    expect([...world.sessions.keys()]).toEqual(["live"])
  })

  it("takes the client IP like Symfony behind trusted proxies", () => {
    const ip = (forwarded: string) => clientIp(request({ "x-forwarded-for": forwarded }), "127.0.0.1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16")
    expect(ip("::1")).toBe("::1")
    expect(ip("203.0.113.9, 10.0.0.2")).toBe("203.0.113.9")
    expect(ip("198.51.100.1, 203.0.113.9")).toBe("203.0.113.9")
    expect(ip("127.0.0.1")).toBe("127.0.0.1")
    expect(clientIp(request())).toBeNull()
  })
})
