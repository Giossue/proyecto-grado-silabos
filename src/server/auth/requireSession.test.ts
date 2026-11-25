// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { authWorld, browserRequest, cookieHeaderFrom, type AuthWorld } from "./betterAuthTesting"
import { requireSession } from "./requireSession"
import type { AppSession } from "./types"

const USER = "0193a3c2-1111-7000-8000-000000000001"
const OTHER_USER = "0193a3c2-1111-7000-8000-000000000002"
const ROLE = "0193a3c2-2222-7000-8000-000000000001"
const SECOND_ROLE = "0193a3c2-2222-7000-8000-000000000002"
const PASSWORD = "Demo-2026!"
const START = new Date("2026-11-25T12:00:00Z")

let world: AuthWorld

async function signIn(email = "docente@silabos.test"): Promise<string> {
  const { headers } = await world.auth.api.signInEmail({ body: { email, password: PASSWORD }, headers: new Headers({ origin: "http://localhost:3000" }), returnHeaders: true })
  return cookieHeaderFrom(headers.getSetCookie())
}

function minutes(value: number): void {
  vi.setSystemTime(new Date(START.getTime() + value * 60_000))
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(START)
  world = authWorld({ lifetimeMinutes: 240 })
  await world.addUser({ id: USER, email: "docente@silabos.test" }, PASSWORD)
  world.assignments.push({ id: ROLE, userId: USER, role: "docente", careerId: "c-1", careerLabel: "Software" })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("requireSession on Better Auth", () => {
  it("keeps the session alive for the configured 240 minutes and renews it on activity", async () => {
    const cookie = await signIn()
    minutes(239)
    const renewed = await requireSession(browserRequest("/api/v1/session", { cookie }), {}, world.deps)
    expect(renewed).not.toBeInstanceOf(Response)
    expect(world.cookies.some((header) => header.startsWith("silabos-ueb.session_token="))).toBe(true)
    const stored = world.db.session[0]
    expect(new Date(String(stored.expiresAt)).getTime()).toBe(START.getTime() + (239 + 240) * 60_000)
    minutes(239 + 239)
    expect(await requireSession(browserRequest("/api/v1/session", { cookie }), {}, world.deps)).not.toBeInstanceOf(Response)
    minutes(239 + 239 + 241)
    const expired = await requireSession(browserRequest("/api/v1/session", { cookie }), {}, world.deps)
    expect(expired).toBeInstanceOf(Response)
    expect((expired as Response).status).toBe(401)
  })

  it("takes the lifetime from the configuration", async () => {
    world = authWorld({ lifetimeMinutes: 30 })
    await world.addUser({ id: USER, email: "docente@silabos.test" }, PASSWORD)
    const cookie = await signIn()
    minutes(29)
    expect(await requireSession(browserRequest("/api/v1/session", { cookie }), {}, world.deps)).not.toBeInstanceOf(Response)
    minutes(29 + 31)
    expect(((await requireSession(browserRequest("/api/v1/session", { cookie }), {}, world.deps)) as Response).status).toBe(401)
  })

  it("blocks an account deactivated during its session and revokes every session it had", async () => {
    const first = await signIn()
    const second = await signIn()
    world.user(USER)!.active = false
    const blocked = (await requireSession(browserRequest("/api/v1/session", { cookie: first }), {}, world.deps)) as Response
    expect(blocked.status).toBe(403)
    expect(await blocked.json()).toEqual({ message: "La cuenta está desactivada." })
    expect(world.db.session).toHaveLength(0)
    world.user(USER)!.active = true
    expect(((await requireSession(browserRequest("/api/v1/session", { cookie: second }), {}, world.deps)) as Response).status).toBe(401)
  })

  it("refuses to create a session for an inactive account", async () => {
    world.user(USER)!.active = false
    await expect(signIn()).rejects.toMatchObject({ body: { code: "ACCOUNT_INACTIVE" } })
    expect(world.db.session).toHaveLength(0)
  })

  it("selects the sole role on the session and drops a stale role", async () => {
    const cookie = await signIn()
    const session = (await requireSession(browserRequest("/api/v1/session", { cookie }), { activeRole: "required" }, world.deps)) as AppSession
    expect(session.activeRole?.id).toBe(ROLE)
    expect(world.db.session[0].activeRoleAssignmentId).toBe(ROLE)
    world.assignments.splice(0, 1, { id: SECOND_ROLE, userId: USER, role: "coordinador", careerId: "c-1", careerLabel: "Software" })
    const replaced = (await requireSession(browserRequest("/api/v1/session", { cookie }), { activeRole: "required" }, world.deps)) as AppSession
    expect(replaced.activeRole?.id).toBe(SECOND_ROLE)
    expect(world.db.session[0].activeRoleAssignmentId).toBe(SECOND_ROLE)
  })

  it("answers 409 «Seleccione un rol vigente.» while several roles wait for a choice, per session", async () => {
    world.assignments.push({ id: SECOND_ROLE, userId: USER, role: "coordinador", careerId: "c-2", careerLabel: "Redes" })
    const first = await signIn()
    const second = await signIn()
    const pending = (await requireSession(browserRequest("/api/v1/session", { cookie: first }), { activeRole: "required" }, world.deps)) as Response
    expect(pending.status).toBe(409)
    expect(await pending.json()).toEqual({ message: "Seleccione un rol vigente." })
    const optional = (await requireSession(browserRequest("/api/v1/session", { cookie: first }), { activeRole: "optional" }, world.deps)) as AppSession
    await world.deps.sessions.setActiveRole(optional.session, SECOND_ROLE)
    expect(((await requireSession(browserRequest("/api/v1/session", { cookie: first }), { activeRole: "required" }, world.deps)) as AppSession).activeRole?.id).toBe(SECOND_ROLE)
    expect(((await requireSession(browserRequest("/api/v1/session", { cookie: second }), { activeRole: "required" }, world.deps)) as Response).status).toBe(409)
  })

  it("only accepts requests that come from the web application", async () => {
    const cookie = await signIn()
    expect(((await requireSession(browserRequest("/api/v1/session", { cookie, origin: null }), {}, world.deps)) as Response).status).toBe(401)
    expect(((await requireSession(browserRequest("/api/v1/session", { cookie, origin: "https://evil.example" }), {}, world.deps)) as Response).status).toBe(401)
    const post = browserRequest("/api/v1/notifications/read", { method: "POST", cookie, origin: "https://evil.example", headers: { referer: "http://localhost:3000/inicio" } })
    expect(((await requireSession(post, {}, world.deps)) as Response).status).toBe(401)
    expect(await requireSession(browserRequest("/api/v1/session", { cookie }), {}, world.deps)).not.toBeInstanceOf(Response)
  })

  it("keeps another user's session apart and answers 401 without a session cookie", async () => {
    await world.addUser({ id: OTHER_USER, email: "otra@silabos.test" }, PASSWORD)
    const cookie = await signIn("otra@silabos.test")
    expect(((await requireSession(browserRequest("/api/v1/session", { cookie }), {}, world.deps)) as AppSession).user.id).toBe(OTHER_USER)
    expect(((await requireSession(browserRequest("/api/v1/session"), {}, world.deps)) as Response).status).toBe(401)
  })

  it("keeps an unverified address out of verified routes with the same message as before", async () => {
    world.user(USER)!.emailVerified = false
    const cookie = await signIn()
    const blocked = (await requireSession(browserRequest("/api/v1/session", { cookie }), { verified: true }, world.deps)) as Response
    expect(blocked.status).toBe(403)
    expect(await blocked.json()).toEqual({ message: "Your email address is not verified." })
  })
})
