// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { recallerCookieName } from "../laravel/sessionGuard"
import { requireSession } from "./requireSession"
import {
  NOW,
  apiRequest,
  fakeDeps,
  loggedInAttributes,
  makeAssignment,
  makeUser,
  sessionCookie,
  sessionPayload,
  xsrfHeader,
  type FakeWorld,
} from "./testing"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`

let world: FakeWorld
let forwarded: Request[]

function withSession(attributes: Record<string, unknown>, lastActivity = NOW): void {
  world.sessions.set(SESSION_ID, { payload: sessionPayload(attributes), lastActivity })
}

async function expectError(result: unknown, status: number, body: string): Promise<void> {
  expect(result).toBeInstanceOf(Response)
  const response = result as Response
  expect(response.status).toBe(status)
  expect(await response.text()).toBe(body)
  expect(response.headers.get("content-type")).toBe("application/json")
}

beforeEach(() => {
  world = { sessions: new Map(), users: [makeUser()], assignments: [makeAssignment()] }
  forwarded = []
})

describe("requireSession", () => {
  it("reads the session PHP wrote, with its unicode payload", async () => {
    world.sessions.set(SESSION_ID, { payload: golden.sessionPayload, lastActivity: NOW })
    world.users = [makeUser({ passwordHash: golden.passwordHash })]
    const result = await requireSession(
      apiRequest("/api/v1/notifications", { cookie: `${golden.cookieName}=${encodeURIComponent(golden.sessionCookie)}` }),
      { verified: true, activeRole: "required" },
      fakeDeps(world, forwarded),
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

  it("lets Laravel answer when the session role is stale, since Laravel forgets it", async () => {
    withSession(loggedInAttributes({ active_role_assignment_id: "00000000-0000-0000-0000-000000000000" }))
    world.assignments = [makeAssignment({ id: "r-1" }), makeAssignment({ id: "r-2", role: "bibliotecario", careerId: null })]
    const result = await requireSession(apiRequest("/api/v1/notifications", { cookie }), { activeRole: "required" }, fakeDeps(world, forwarded))
    expect(forwarded).toHaveLength(1)
    expect((result as Response).status).toBe(299)
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
    const result = await requireSession(apiRequest("/api/v1/notifications", { cookie }), { activeRole: "required" }, fakeDeps(world, forwarded))
    expect(forwarded).toHaveLength(1)
    expect((result as Response).status).toBe(299)
  })

  it("lets Laravel pick the sole eligible role, since that writes the session", async () => {
    withSession(loggedInAttributes({ active_role_assignment_id: undefined }))
    const result = await requireSession(apiRequest("/api/v1/notifications", { cookie }), { activeRole: "optional" }, fakeDeps(world, forwarded))
    expect(forwarded).toHaveLength(1)
    expect((result as Response).status).toBe(299)
  })

  it("lets Laravel answer when only a remember-me cookie identifies the user", async () => {
    withSession({ _token: golden.csrfToken })
    const request = apiRequest("/api/v1/notifications", { cookie: `${cookie}; ${recallerCookieName()}=x` })
    expect(((await requireSession(request, {}, fakeDeps(world, forwarded))) as Response).status).toBe(299)
    expect(forwarded).toHaveLength(1)
  })

  it("lets Laravel answer when the session has no password hash yet", async () => {
    withSession(loggedInAttributes({ password_hash_web: undefined }))
    expect(((await requireSession(apiRequest("/api/v1/notifications", { cookie }), {}, fakeDeps(world, forwarded))) as Response).status).toBe(299)
  })

  it("lets Laravel answer an unverified user that does not expect JSON", async () => {
    withSession(loggedInAttributes())
    world.users = [makeUser({ emailVerifiedAt: null })]
    const request = apiRequest("/api/v1/notifications", { cookie, headers: { accept: "text/html" } })
    expect(((await requireSession(request, { verified: true }, fakeDeps(world, forwarded))) as Response).status).toBe(299)
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
    const result = await requireSession(apiRequest("/api/v1/notifications", { cookie }), { verified: true }, fakeDeps(world, forwarded))
    expect(result).not.toBeInstanceOf(Response)
    expect(world.sessions.get(SESSION_ID)).toEqual({ payload: before, lastActivity: NOW })
  })

  it("also refreshes it when the answer is an error Laravel renders inside the session", async () => {
    withSession(loggedInAttributes({ active_role_assignment_id: undefined }), NOW - 600)
    world.assignments = [makeAssignment(), makeAssignment({ id: "r-2" })]
    await expectError(
      await requireSession(apiRequest("/api/v1/dashboard", { cookie }), { verified: true, activeRole: "required" }, fakeDeps(world)),
      409,
      '{\n    "message": "Seleccione un rol vigente."\n}',
    )
    expect(world.sessions.get(SESSION_ID)?.lastActivity).toBe(NOW)
  })

  it("leaves the row alone on a CSRF mismatch, an expired session, or a request Laravel answers", async () => {
    withSession(loggedInAttributes(), NOW - 600)
    await requireSession(post({ "x-xsrf-token": xsrfHeader("other") }), {}, fakeDeps(world))
    expect(world.sessions.get(SESSION_ID)?.lastActivity).toBe(NOW - 600)

    withSession(loggedInAttributes(), NOW - 121 * 60)
    await requireSession(apiRequest("/api/v1/notifications", { cookie }), {}, fakeDeps(world))
    expect(world.sessions.get(SESSION_ID)?.lastActivity).toBe(NOW - 121 * 60)

    withSession(loggedInAttributes({ active_role_assignment_id: undefined }), NOW - 600)
    await requireSession(apiRequest("/api/v1/dashboard", { cookie }), { activeRole: "required" }, fakeDeps(world, forwarded))
    expect(forwarded).toHaveLength(1)
    expect(world.sessions.get(SESSION_ID)?.lastActivity).toBe(NOW - 600)
  })

  it("does not touch anything without a stateful Referer", async () => {
    withSession(loggedInAttributes(), NOW - 600)
    const request = new Request("http://localhost:3000/api/v1/notifications", { headers: { accept: "application/json", cookie } })
    await requireSession(request, {}, fakeDeps(world))
    expect(world.sessions.get(SESSION_ID)?.lastActivity).toBe(NOW - 600)
  })
})
