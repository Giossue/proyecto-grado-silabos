// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { showSession, twoFactorStatus, type UserProfile } from "./session"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const SECOND_ROLE = "a0000000-0000-4000-8000-000000000002"

let world: FakeWorld
let profile: UserProfile
let forwarded: Request[]

async function call(handler: typeof showSession, path: string) {
  const response = await handler(apiRequest(path, { cookie }), {
    bridge: fakeDeps(world, forwarded),
    profiles: { find: async (id) => (id === golden.userId ? profile : null) },
    today: () => "2026-10-21",
    timezone: () => "America/Guayaquil",
  })
  return { status: response.status, text: await response.text() }
}

beforeEach(() => {
  world = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ careerLabel: "Software · SW-8" })],
  }
  profile = {
    name: "ANA PÉREZ",
    email: "ana@ueb.edu.ec",
    formation: null,
    accessibility: {},
    twoFactorSecret: false,
    twoFactorConfirmed: false,
  }
  forwarded = []
})

describe("session", () => {
  it("returns the teacher session with its sole role and the institutional day", async () => {
    const response = await call(showSession, "/api/v1/session")
    expect(response.status).toBe(200)
    expect(response.text).toBe(
      `{"user":{"id":"${golden.userId}","name":"ANA P\\u00c9REZ","email":"ana@ueb.edu.ec","email_verified":true,"can_edit_identity":false,"formation":null,"accessibility":[]},` +
        `"active_role":{"id":"${golden.roleId}","code":"docente","career_id":"c-1","career_name":"Software \\u00b7 SW-8"},` +
        `"available_roles":[{"id":"${golden.roleId}","code":"docente","career_id":"c-1","career_name":"Software \\u00b7 SW-8"}],` +
        `"institution":{"today":"2026-10-21","timezone":"America\\/Guayaquil"}}`,
    )
  })

  it("lets only Administration edit its identity and keeps the accessibility preferences", async () => {
    world.assignments = [makeAssignment({ role: "administrador", careerId: null, careerLabel: null }), makeAssignment({ id: SECOND_ROLE, role: "docente" })]
    profile = { ...profile, formation: "Magíster", accessibility: { font_size: "grande", reduce_motion: true, "0": 1 } }
    const json = JSON.parse((await call(showSession, "/api/v1/session")).text)
    expect(json.user).toMatchObject({ can_edit_identity: true, formation: "Magíster", accessibility: { font_size: "grande", reduce_motion: true, "0": 1 } })
    expect(json.available_roles.map((role: { id: string }) => role.id)).toEqual([golden.roleId, SECOND_ROLE])
    expect(json.active_role).toEqual({ id: golden.roleId, code: "administrador", career_id: null, career_name: null })
  })

  it("works without a verified email and without an active role", async () => {
    world.users = [makeUser({ emailVerifiedAt: null })]
    world.assignments = [makeAssignment(), makeAssignment({ id: SECOND_ROLE, role: "bibliotecario", careerId: null, careerLabel: null })]
    world.sessions.set(SESSION_ID, { payload: sessionPayload(loggedInAttributes({ active_role_assignment_id: undefined })), lastActivity: NOW })
    const json = JSON.parse((await call(showSession, "/api/v1/session")).text)
    expect(json.user.email_verified).toBe(false)
    expect(json.active_role).toBeNull()
    expect(json.available_roles).toHaveLength(2)
  })

  it("sends Laravel the requests that would pick the sole role", async () => {
    world.sessions.set(SESSION_ID, { payload: sessionPayload(loggedInAttributes({ active_role_assignment_id: undefined })), lastActivity: NOW })
    expect((await call(showSession, "/api/v1/session")).status).toBe(299)
    expect(forwarded).toHaveLength(1)
  })
})

describe("two-factor status", () => {
  it("reports whether the second factor is on or waiting for confirmation", async () => {
    expect(await call(twoFactorStatus, "/api/v1/authentication/two-factor")).toEqual({ status: 200, text: '{"enabled":false,"confirmation_required":false}' })
    profile = { ...profile, twoFactorSecret: true }
    expect((await call(twoFactorStatus, "/api/v1/authentication/two-factor")).text).toBe('{"enabled":false,"confirmation_required":true}')
    profile = { ...profile, twoFactorConfirmed: true }
    expect((await call(twoFactorStatus, "/api/v1/authentication/two-factor")).text).toBe('{"enabled":true,"confirmation_required":false}')
  })

  it("answers 401 without a session", async () => {
    world.sessions.clear()
    expect(await call(twoFactorStatus, "/api/v1/authentication/two-factor")).toEqual({ status: 401, text: '{"message":"Unauthenticated."}' })
  })
})
