// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { recallerCookieName } from "../http/sessionGuard"
import { requireSession } from "./requireSession"
import { serializeCookie } from "./sessionWriter"
import type { BridgeDeps, OutgoingCookie } from "./types"
import { cookiePrefix } from "../http/cookies"
import { decrypt } from "../http/encrypter"
import {
  NOW,
  apiRequest,
  recallerCookie,
  fakeDeps,
  loggedInAttributes,
  makeAssignment,
  makeUser,
  sessionCookie,
  sessionPayload,
  storedJson,
  testKey,
  xsrfHeader,
  type FakeWorld,
} from "./testing"
import { hashPasswordForCookie, loginSessionKey } from "../http/sessionGuard"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`

let world: FakeWorld

function withSession(attributes: Record<string, unknown>, lastActivity = NOW): void {
  world.sessions.set(SESSION_ID, { payload: sessionPayload(attributes), lastActivity })
}

async function expectError(result: unknown, status: number, body: string): Promise<void> {
  expect(result).toBeInstanceOf(Response)
  const response = result as Response
  expect(response.status).toBe(status)
  expect(JSON.parse(await response.text())).toEqual(JSON.parse(body))
  expect(response.headers.get("content-type")).toBe("application/json")
}

beforeEach(() => {
  world = { sessions: new Map(), users: [makeUser()], assignments: [makeAssignment()] }
})

describe("requireSession", () => {
  it("reads the session PHP wrote, with its unicode payload", async () => {
    world.sessions.set(SESSION_ID, { payload: golden.sessionPayload, lastActivity: NOW })
    world.users = [makeUser({ passwordHash: golden.passwordHash })]
    const result = await requireSession(
      apiRequest("/api/v1/notifications", { cookie: `${golden.cookieName}=${encodeURIComponent(golden.sessionCookie)}` }),
      { verified: true, activeRole: "required" },
      fakeDeps(world),
    )
    expect(result).not.toBeInstanceOf(Response)
    if (result instanceof Response) return
    expect(result.user.id).toBe(golden.userId)
    expect(result.activeRole?.id).toBe(golden.roleId)
    expect(result.attributes.nota).toBe("Sesión con «acentos» y 😀")
  })

  it("answers 401 without a Referer or Origin from a stateful domain", async () => {
    withSession(loggedInAttributes())
    const request = new Request("http://localhost:3000/api/v1/notifications", { headers: { accept: "application/json", cookie } })
    await expectError(await requireSession(request, {}, fakeDeps(world)), 401, golden.errors.unauthenticated.body)
    const foreign = apiRequest("/api/v1/notifications", { cookie, headers: { referer: "http://evil.test/" } })
    await expectError(await requireSession(foreign, {}, fakeDeps(world)), 401, golden.errors.unauthenticated.body)
  })

  it("accepts the Origin header when there is no Referer", async () => {
    withSession(loggedInAttributes())
    const request = new Request("http://localhost:3000/api/v1/notifications", {
      headers: { accept: "application/json", cookie, origin: "http://localhost:3000" },
    })
    expect(await requireSession(request, {}, fakeDeps(world))).not.toBeInstanceOf(Response)
  })

  it("answers 401 without a session cookie", async () => {
    withSession(loggedInAttributes())
    await expectError(await requireSession(apiRequest("/api/v1/notifications"), {}, fakeDeps(world)), 401, golden.errors.unauthenticated.body)
  })

  it("answers 401 when the cookie MAC is invalid", async () => {
    withSession(loggedInAttributes())
    const envelope = JSON.parse(Buffer.from(sessionCookie(SESSION_ID), "base64").toString())
    envelope.mac = "0".repeat(64)
    const tampered = Buffer.from(JSON.stringify(envelope)).toString("base64")
    const request = apiRequest("/api/v1/notifications", { cookie: `${golden.cookieName}=${tampered}` })
    await expectError(await requireSession(request, {}, fakeDeps(world)), 401, golden.errors.unauthenticated.body)
  })

  it("answers 401 when the session payload MAC is invalid", async () => {
    world.sessions.set(SESSION_ID, { payload: golden.sessionPayloadWithOtherKey, lastActivity: NOW })
    await expectError(await requireSession(apiRequest("/api/v1/notifications", { cookie }), {}, fakeDeps(world)), 401, golden.errors.unauthenticated.body)
  })

  it("answers 401 when the session is older than the 120 minute lifetime", async () => {
    withSession(loggedInAttributes(), NOW - 120 * 60 - 1)
    await expectError(await requireSession(apiRequest("/api/v1/notifications", { cookie }), {}, fakeDeps(world)), 401, golden.errors.unauthenticated.body)
    withSession(loggedInAttributes(), NOW - 120 * 60)
    expect(await requireSession(apiRequest("/api/v1/notifications", { cookie }), {}, fakeDeps(world))).not.toBeInstanceOf(Response)
  })

  it("answers 401 when the user no longer exists", async () => {
    withSession(loggedInAttributes())
    world.users = []
    await expectError(await requireSession(apiRequest("/api/v1/notifications", { cookie }), {}, fakeDeps(world)), 401, golden.errors.unauthenticated.body)
  })

  it("answers 401 when the password changed since the login", async () => {
    withSession(loggedInAttributes())
    world.users = [makeUser({ passwordHash: "$2y$12$otherhash" })]
    await expectError(await requireSession(apiRequest("/api/v1/notifications", { cookie }), {}, fakeDeps(world)), 401, golden.errors.unauthenticated.body)
  })

  it("answers 403 and Laravel's text for an inactive user", async () => {
    withSession(loggedInAttributes())
    world.users = [makeUser({ active: false })]
    await expectError(await requireSession(apiRequest("/api/v1/notifications", { cookie }), {}, fakeDeps(world)), 403, golden.errors.inactive.body)
  })

  it("answers 403 to an unverified user only where the route needs it", async () => {
    withSession(loggedInAttributes())
    world.users = [makeUser({ emailVerifiedAt: null })]
    const request = () => apiRequest("/api/v1/notifications", { cookie })
    await expectError(await requireSession(request(), { verified: true }, fakeDeps(world)), 403, golden.errors.unverified.body)
    expect(await requireSession(request(), {}, fakeDeps(world))).not.toBeInstanceOf(Response)
  })

  it("forgets a stale session role and writes the session in place, like Laravel's ActiveRole", async () => {
    withSession(loggedInAttributes({ active_role_assignment_id: "00000000-0000-0000-0000-000000000000" }), NOW - 60)
    world.assignments = [makeAssignment({ id: "r-1" }), makeAssignment({ id: "r-2", role: "bibliotecario", careerId: null })]
    const result = await requireSession(apiRequest("/api/v1/notifications", { cookie }), { activeRole: "required" }, fakeDeps(world))
    await expectError(result, 409, golden.errors.noActiveRole.body)
    expect(storedJson(world, SESSION_ID)).toBe(
      JSON.stringify({ _token: golden.csrfToken, [loginSessionKey()]: golden.userId, password_hash_web: golden.passwordHashForCookie, _flash: { old: [], new: [] } }),
    )
    expect(world.sessions.get(SESSION_ID)).toMatchObject({ lastActivity: NOW, userId: golden.userId, ipAddress: null, userAgent: "" })
  })

  it("moves a stale role to the sole eligible one at the end of the session, like forget then put", async () => {
    withSession(loggedInAttributes({ active_role_assignment_id: "00000000-0000-0000-0000-000000000000" }))
    world.assignments = [makeAssignment({ id: "r-1" })]
    const result = await requireSession(apiRequest("/api/v1/notifications", { cookie }), { activeRole: "required" }, fakeDeps(world))
    expect((result as { activeRole: { id: string } }).activeRole.id).toBe("r-1")
    expect(storedJson(world, SESSION_ID)).toBe(
      JSON.stringify({
        _token: golden.csrfToken,
        [loginSessionKey()]: golden.userId,
        password_hash_web: golden.passwordHashForCookie,
        active_role_assignment_id: "r-1",
        _flash: { old: [], new: [] },
      }),
    )
  })

  it("answers 409 when there is no role in the session and no single eligible role", async () => {
    withSession(loggedInAttributes({ active_role_assignment_id: undefined }))
    world.assignments = [makeAssignment({ id: "r-1" }), makeAssignment({ id: "r-2", role: "bibliotecario", careerId: null })]
    await expectError(
      await requireSession(apiRequest("/api/v1/notifications", { cookie }), { activeRole: "required" }, fakeDeps(world)),
      409,
      golden.errors.noActiveRole.body,
    )
  })

  it("does not count a coordinator assignment without a career as eligible", async () => {
    withSession(loggedInAttributes({ active_role_assignment_id: "r-1" }))
    world.assignments = [makeAssignment({ id: "r-1", role: "coordinador", careerId: null })]
    const result = await requireSession(apiRequest("/api/v1/notifications", { cookie }), { activeRole: "required" }, fakeDeps(world))
    await expectError(result, 409, golden.errors.noActiveRole.body)
    expect(JSON.parse(storedJson(world, SESSION_ID) ?? "{}")).not.toHaveProperty("active_role_assignment_id")
  })

  it("picks the sole eligible role and stores it in the session, like Laravel", async () => {
    withSession(loggedInAttributes({ active_role_assignment_id: undefined }))
    const result = await requireSession(apiRequest("/api/v1/notifications", { cookie }), { activeRole: "optional" }, fakeDeps(world))
    expect((result as { activeRole: { id: string } }).activeRole.id).toBe(golden.roleId)
    expect(storedJson(world, SESSION_ID)).toBe(
      JSON.stringify({
        _token: golden.csrfToken,
        [loginSessionKey()]: golden.userId,
        password_hash_web: golden.passwordHashForCookie,
        active_role_assignment_id: golden.roleId,
        _flash: { old: [], new: [] },
      }),
    )
  })

  it("logs the user in from a valid remember-me cookie and migrates the session, like SessionGuard::userFromRecaller", async () => {
    withSession({ _token: golden.csrfToken })
    world.users = [makeUser({ rememberToken: "recordar" })]
    const remembered = `${recallerCookieName()}=${encodeURIComponent(recallerCookie(`${golden.userId}|recordar|hash`))}`
    const session = await requireSession(apiRequest("/api/v1/notifications", { cookie: `${cookie}; ${remembered}` }), {}, fakeDeps(world))
    expect(session).not.toBeInstanceOf(Response)
    expect(world.sessions.has(SESSION_ID)).toBe(false)
    const [id] = [...world.sessions.keys()]
    expect(JSON.parse(storedJson(world, id) ?? "{}")[loginSessionKey()]).toBe(golden.userId)
  })

  it("stays a guest with a remember-me cookie whose token does not match and answers 500 for a malformed user id", async () => {
    withSession({ _token: golden.csrfToken })
    world.users = [makeUser({ rememberToken: "recordar" })]
    const wrong = `${recallerCookieName()}=${encodeURIComponent(recallerCookie(`${golden.userId}|otro|hash`))}`
    await expectError(await requireSession(apiRequest("/api/v1/notifications", { cookie: `${cookie}; ${wrong}` }), {}, fakeDeps(world)), 401, '{"message":"Unauthenticated."}')
    const malformed = `${recallerCookieName()}=${encodeURIComponent(recallerCookie("abc|recordar|hash"))}`
    await expectError(await requireSession(apiRequest("/api/v1/notifications", { cookie: `${cookie}; ${malformed}` }), {}, fakeDeps(world)), 500, '{"message":"Server Error"}')
    await expectError(await requireSession(apiRequest("/api/v1/notifications", { cookie: `${cookie}; ${recallerCookieName()}=x` }), {}, fakeDeps(world)), 401, '{"message":"Unauthenticated."}')
  })

  it("stores the password hash when the session has none yet, like Sanctum's AuthenticateSession", async () => {
    withSession(loggedInAttributes({ password_hash_web: undefined }))
    const result = await requireSession(apiRequest("/api/v1/notifications", { cookie }), {}, fakeDeps(world))
    expect(result).not.toBeInstanceOf(Response)
    expect(storedJson(world, SESSION_ID)).toBe(
      JSON.stringify({
        _token: golden.csrfToken,
        [loginSessionKey()]: golden.userId,
        active_role_assignment_id: golden.roleId,
        password_hash_web: golden.passwordHashForCookie,
        _flash: { old: [], new: [] },
      }),
    )
  })

  it("replaces a raw password hash in the session with the keyed hash", async () => {
    withSession(loggedInAttributes({ password_hash_web: golden.passwordHash }))
    expect(await requireSession(apiRequest("/api/v1/notifications", { cookie }), {}, fakeDeps(world))).not.toBeInstanceOf(Response)
    expect(JSON.parse(storedJson(world, SESSION_ID) ?? "{}").password_hash_web).toBe(hashPasswordForCookie(golden.passwordHash, golden.appKey))
  })

  it("does not store the password hash of a deactivated account, whose session is invalidated", async () => {
    withSession(loggedInAttributes({ password_hash_web: undefined }), NOW - 60)
    world.users = [makeUser({ active: false })]
    await requireSession(apiRequest("/api/v1/notifications", { cookie }), {}, fakeDeps(world))
    expect(world.sessions.has(SESSION_ID)).toBe(false)
    const [id] = [...world.sessions.keys()]
    expect(JSON.parse(storedJson(world, id) ?? "{}")).not.toHaveProperty("password_hash_web")
  })

  it("answers Laravel's 500 to an unverified user that does not expect JSON, since there is no verification page", async () => {
    withSession(loggedInAttributes())
    world.users = [makeUser({ emailVerifiedAt: null })]
    const request = apiRequest("/api/v1/notifications", { cookie, headers: { accept: "text/html" } })
    await expectError(await requireSession(request, { verified: true }, fakeDeps(world)), 500, '{"message":"Server Error"}')
  })

  describe("CSRF", () => {
    const post = (headers: Record<string, string>, withCookie = true) =>
      apiRequest("/api/v1/notifications/read-all", { method: "POST", cookie: withCookie ? cookie : undefined, headers })

    it("answers 419 when the X-XSRF-TOKEN does not match the session token", async () => {
      withSession(loggedInAttributes())
      await expectError(await requireSession(post({ "x-xsrf-token": xsrfHeader("other") }), {}, fakeDeps(world)), 419, golden.errors.csrf.body)
      await expectError(await requireSession(post({ "x-xsrf-token": "garbage" }), {}, fakeDeps(world)), 419, golden.errors.csrf.body)
      await expectError(await requireSession(post({}), {}, fakeDeps(world)), 419, golden.errors.csrf.body)
    })

    it("checks the token before the login, like Laravel's middleware order", async () => {
      await expectError(await requireSession(post({ "x-xsrf-token": xsrfHeader("other") }, false), {}, fakeDeps(world)), 419, golden.errors.csrf.body)
    })

    it("accepts the encrypted XSRF header, the plain X-CSRF-TOKEN and same-origin fetches", async () => {
      withSession(loggedInAttributes())
      expect(await requireSession(post({ "x-xsrf-token": xsrfHeader(golden.csrfToken) }), {}, fakeDeps(world))).not.toBeInstanceOf(Response)
      expect(await requireSession(post({ "x-csrf-token": golden.csrfToken }), {}, fakeDeps(world))).not.toBeInstanceOf(Response)
      expect(await requireSession(post({ "sec-fetch-site": "same-origin" }), {}, fakeDeps(world))).not.toBeInstanceOf(Response)
    })

    it("accepts the XSRF header the PHP side encrypted", async () => {
      withSession(loggedInAttributes())
      expect(await requireSession(post({ "x-xsrf-token": golden.xsrfHeader }), {}, fakeDeps(world))).not.toBeInstanceOf(Response)
    })
  })
})

describe("session keep-alive", () => {
  const post = (headers: Record<string, string>) => apiRequest("/api/v1/notifications/read-all", { method: "POST", cookie, headers })

  it("refreshes only last_activity when Next serves the request, like Laravel's database handler", async () => {
    withSession(loggedInAttributes(), NOW - 600)
    const before = world.sessions.get(SESSION_ID)?.payload
    const result = await requireSession(apiRequest("/api/v1/notifications", { cookie }), { verified: true }, fakeDeps(world))
    expect(result).not.toBeInstanceOf(Response)
    expect(world.sessions.get(SESSION_ID)).toEqual({ payload: before, lastActivity: NOW })
  })

  it("also refreshes it when the answer is an error Laravel renders inside the session", async () => {
    withSession(loggedInAttributes({ active_role_assignment_id: undefined }), NOW - 600)
    world.assignments = [makeAssignment(), makeAssignment({ id: "r-2" })]
    await expectError(
      await requireSession(apiRequest("/api/v1/dashboard", { cookie }), { verified: true, activeRole: "required" }, fakeDeps(world)),
      409,
      '{"message":"Seleccione un rol vigente."}',
    )
    expect(world.sessions.get(SESSION_ID)?.lastActivity).toBe(NOW)
  })

  it("keeps the session alive on a CSRF mismatch, rewrites an expired one, and keeps it alive on the 500 of an unverified page", async () => {
    withSession(loggedInAttributes(), NOW - 600)
    await requireSession(post({ "x-xsrf-token": xsrfHeader("other") }), {}, fakeDeps(world))
    expect(world.sessions.get(SESSION_ID)?.lastActivity).toBe(NOW)

    withSession(loggedInAttributes(), NOW - 121 * 60)
    await requireSession(apiRequest("/api/v1/notifications", { cookie }), {}, fakeDeps(world))
    expect(world.sessions.get(SESSION_ID)?.lastActivity).toBe(NOW)
    expect(JSON.parse(storedJson(world, SESSION_ID) ?? "{}")).not.toHaveProperty(loginSessionKey())

    withSession(loggedInAttributes(), NOW - 600)
    world.users = [makeUser({ emailVerifiedAt: null })]
    await requireSession(apiRequest("/api/v1/dashboard", { cookie, headers: { accept: "text/html" } }), { verified: true }, fakeDeps(world))
    expect(world.sessions.get(SESSION_ID)?.lastActivity).toBe(NOW)
  })

  it("does not touch anything without a stateful Referer", async () => {
    withSession(loggedInAttributes(), NOW - 600)
    const request = new Request("http://localhost:3000/api/v1/notifications", { headers: { accept: "application/json", cookie } })
    await requireSession(request, {}, fakeDeps(world))
    expect(world.sessions.get(SESSION_ID)?.lastActivity).toBe(NOW - 600)
  })
})

describe("session cookies on every answer, like StartSession and VerifyCsrfToken", () => {
  let queued: OutgoingCookie[]

  const tracked = (): BridgeDeps => ({ ...fakeDeps(world), queueCookies: async (cookies) => void queued.push(...cookies) })
  const plainOf = (cookie: OutgoingCookie) => decrypt(cookie.value, testKey, false).slice(41)
  const named = (name: string) => queued.filter((cookie) => cookie.name === name)
  const post = (headers: Record<string, string>) => apiRequest("/api/v1/notifications/read-all", { method: "POST", cookie, headers })

  beforeEach(() => {
    queued = []
  })

  it("sends both cookies with a fresh 120 minute expiry and Laravel's attributes", async () => {
    withSession(loggedInAttributes(), NOW - 600)
    expect(await requireSession(apiRequest("/api/v1/notifications", { cookie }), {}, tracked())).not.toBeInstanceOf(Response)
    expect(queued.map((cookie) => cookie.name)).toEqual(["XSRF-TOKEN", golden.cookieName])
    const [xsrf, session] = queued
    expect(xsrf).toMatchObject({ expires: NOW + 7200, maxAge: 7200, path: "/", domain: null, secure: false, httpOnly: false, sameSite: "lax" })
    expect(session).toMatchObject({ expires: NOW + 7200, maxAge: 7200, path: "/", domain: null, secure: false, httpOnly: true, sameSite: "lax" })
    expect(decrypt(xsrf.value, testKey, false)).toBe(cookiePrefix("XSRF-TOKEN", testKey) + golden.csrfToken)
    expect(decrypt(session.value, testKey, false)).toBe(cookiePrefix(golden.cookieName, testKey) + SESSION_ID)
    expect(serializeCookie(xsrf)).toMatch(/^XSRF-TOKEN=[^;]+; expires=[A-Z][a-z]{2}, \d\d [A-Z][a-z]{2} \d{4} \d\d:\d\d:\d\d GMT; Max-Age=7200; path=\/; samesite=lax$/)
  })

  it("also sends them with the 403 and 409 answers Laravel renders inside the session", async () => {
    withSession(loggedInAttributes())
    world.users = [makeUser({ emailVerifiedAt: null })]
    await expectError(await requireSession(apiRequest("/api/v1/dashboard", { cookie }), { verified: true }, tracked()), 403, golden.errors.unverified.body)
    expect(queued.map((cookie) => cookie.name)).toEqual(["XSRF-TOKEN", golden.cookieName])
    queued = []
    world.users = [makeUser()]
    withSession(loggedInAttributes({ active_role_assignment_id: undefined }))
    world.assignments = [makeAssignment(), makeAssignment({ id: "r-2" })]
    await expectError(await requireSession(apiRequest("/api/v1/dashboard", { cookie }), { activeRole: "required" }, tracked()), 409, golden.errors.noActiveRole.body)
    expect(queued.map((cookie) => cookie.name)).toEqual(["XSRF-TOKEN", golden.cookieName])
  })

  it("sends no cookie and writes nothing without a stateful Referer", async () => {
    withSession(loggedInAttributes(), NOW - 600)
    const request = new Request("http://localhost:3000/api/v1/notifications", { headers: { accept: "application/json", cookie } })
    await expectError(await requireSession(request, {}, tracked()), 401, golden.errors.unauthenticated.body)
    expect(queued).toEqual([])
    expect(world.sessions.get(SESSION_ID)?.lastActivity).toBe(NOW - 600)
  })

  it("sends both cookies after a remember-me login and forgets the remember cookie of an inactive account", async () => {
    withSession({ _token: golden.csrfToken })
    world.users = [makeUser({ rememberToken: "recordar" })]
    const remembered = `${recallerCookieName()}=${encodeURIComponent(recallerCookie(`${golden.userId}|recordar|hash`))}`
    await requireSession(apiRequest("/api/v1/notifications", { cookie: `${cookie}; ${remembered}` }), {}, tracked())
    expect(queued.map((item) => item.name)).toEqual(["XSRF-TOKEN", golden.cookieName])
    queued = []
    withSession(loggedInAttributes())
    world.users = [makeUser({ active: false })]
    await requireSession(apiRequest("/api/v1/notifications", { cookie: `${cookie}; ${remembered}` }), {}, tracked())
    expect(queued.map((item) => [item.name, item.maxAge])).toEqual([
      ["XSRF-TOKEN", 7200],
      [golden.cookieName, 7200],
      [recallerCookieName(), 0],
    ])
  })

  it("starts and stores a new guest session for a stateful request without one", async () => {
    await expectError(await requireSession(apiRequest("/api/v1/notifications"), {}, tracked()), 401, golden.errors.unauthenticated.body)
    const [id] = [...world.sessions.keys()]
    expect(id).toMatch(/^[A-Za-z0-9]{40}$/)
    const stored = JSON.parse(storedJson(world, id) ?? "{}")
    expect(Object.keys(stored)).toEqual(["_token", "_flash"])
    expect(world.sessions.get(id)).toMatchObject({ lastActivity: NOW, userId: null })
    expect(plainOf(named(golden.cookieName)[0])).toBe(id)
    expect(plainOf(named("XSRF-TOKEN")[0])).toBe(stored._token)
  })

  it("keeps the id of an expired session and overwrites its row as a guest session", async () => {
    withSession(loggedInAttributes(), NOW - 121 * 60)
    await expectError(await requireSession(apiRequest("/api/v1/notifications", { cookie }), {}, tracked()), 401, golden.errors.unauthenticated.body)
    expect([...world.sessions.keys()]).toEqual([SESSION_ID])
    expect(Object.keys(JSON.parse(storedJson(world, SESSION_ID) ?? "{}"))).toEqual(["_token", "_flash"])
    expect(world.sessions.get(SESSION_ID)).toMatchObject({ lastActivity: NOW, userId: null })
    expect(plainOf(named(golden.cookieName)[0])).toBe(SESSION_ID)
  })

  it("answers 419 with only the session cookie and keeps the session alive", async () => {
    withSession(loggedInAttributes(), NOW - 600)
    await expectError(await requireSession(post({ "x-xsrf-token": xsrfHeader("other") }), {}, tracked()), 419, golden.errors.csrf.body)
    expect(queued.map((cookie) => cookie.name)).toEqual([golden.cookieName])
    expect(world.sessions.get(SESSION_ID)?.lastActivity).toBe(NOW)
  })

  it("flushes the session when the password changed, like Sanctum's AuthenticateSession", async () => {
    withSession(loggedInAttributes(), NOW - 600)
    world.users = [makeUser({ passwordHash: "$2y$12$otherhash" })]
    await expectError(await requireSession(apiRequest("/api/v1/notifications", { cookie }), {}, tracked()), 401, golden.errors.unauthenticated.body)
    expect(storedJson(world, SESSION_ID)).toBe(JSON.stringify({ _flash: { old: [], new: [] } }))
    expect(world.sessions.get(SESSION_ID)).toMatchObject({ lastActivity: NOW, userId: null })
    expect(plainOf(named("XSRF-TOKEN")[0])).toBe("")
  })

  it("logs an inactive account out, invalidates its session and cycles a remember token, like EnsureActiveUser", async () => {
    withSession(loggedInAttributes(), NOW - 600)
    world.users = [makeUser({ active: false })]
    world.rememberTokens = new Map([[golden.userId, "token-recordarme"]])
    await expectError(await requireSession(apiRequest("/api/v1/notifications", { cookie }), {}, tracked()), 403, golden.errors.inactive.body)
    expect(world.sessions.has(SESSION_ID)).toBe(false)
    const [id] = [...world.sessions.keys()]
    const stored = JSON.parse(storedJson(world, id) ?? "{}")
    expect(Object.keys(stored)).toEqual(["_token", "_flash"])
    expect(stored._token).not.toBe(golden.csrfToken)
    expect(world.sessions.get(id)).toMatchObject({ lastActivity: NOW, userId: golden.userId })
    expect(world.rememberTokens.get(golden.userId)).toMatch(/^[A-Za-z0-9]{60}$/)
    expect(plainOf(named(golden.cookieName)[0])).toBe(id)
  })

  it("leaves an empty remember token alone when it logs an inactive account out", async () => {
    withSession(loggedInAttributes())
    world.users = [makeUser({ active: false })]
    world.rememberTokens = new Map([[golden.userId, null]])
    await requireSession(apiRequest("/api/v1/notifications", { cookie }), {}, tracked())
    expect(world.rememberTokens.get(golden.userId)).toBeNull()
  })

  it("does not fail outside a Next request when no cookie queue is given", async () => {
    withSession(loggedInAttributes())
    expect(await requireSession(apiRequest("/api/v1/notifications", { cookie }), {}, fakeDeps(world))).not.toBeInstanceOf(Response)
  })
})

describe("security headers, like the middleware order of the api routes", () => {
  it("adds them to the 403 of an unverified email and to the 409 without a role, but not to 401, 403 inactive or 419", async () => {
    withSession(loggedInAttributes())
    world.users = [makeUser({ emailVerifiedAt: null })]
    const unverified = (await requireSession(apiRequest("/api/v1/dashboard", { cookie }), { verified: true }, fakeDeps(world))) as Response
    expect(unverified.headers.get("x-frame-options")).toBe("DENY")
    world.users = [makeUser()]
    withSession(loggedInAttributes({ active_role_assignment_id: undefined }))
    world.assignments = [makeAssignment(), makeAssignment({ id: "r-2" })]
    const noRole = (await requireSession(apiRequest("/api/v1/dashboard", { cookie }), { activeRole: "required" }, fakeDeps(world))) as Response
    expect(noRole.headers.get("x-frame-options")).toBe("DENY")
    expect(noRole.headers.get("content-security-policy")).toBe("frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'")
    const guest = (await requireSession(apiRequest("/api/v1/dashboard"), {}, fakeDeps(world))) as Response
    expect(guest.headers.get("x-frame-options")).toBeNull()
    withSession(loggedInAttributes())
    world.users = [makeUser({ active: false })]
    const inactive = (await requireSession(apiRequest("/api/v1/dashboard", { cookie }), {}, fakeDeps(world))) as Response
    expect(inactive.headers.get("x-frame-options")).toBeNull()
  })
})
