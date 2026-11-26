// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, storedJson, type FakeWorld } from "../auth/testing"
import { showSession, type UserProfile } from "./session"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const SECOND_ROLE = "a0000000-0000-4000-8000-000000000002"

let world: FakeWorld
let profile: UserProfile

async function call(handler: typeof showSession, path: string) {
  const response = await handler(apiRequest(path, { cookie }), {
    bridge: fakeDeps(world),
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
    accessibility: {},
  }
})

describe("session", () => {
  it("returns the teacher session with its sole role and the institutional day", async () => {
    const response = await call(showSession, "/api/v1/session")
    expect(response.status).toBe(200)
    expect(response.text).toBe(
      `{"user":{"id":"${golden.userId}","name":"ANA PÉREZ","email":"ana@ueb.edu.ec","email_verified":true,"can_edit_identity":false,"accessibility":[]},` +
        `"active_role":{"id":"${golden.roleId}","code":"docente","career_id":"c-1","career_name":"Software · SW-8"},` +
        `"available_roles":[{"id":"${golden.roleId}","code":"docente","career_id":"c-1","career_name":"Software · SW-8"}],` +
        `"institution":{"today":"2026-10-21","timezone":"America/Guayaquil"}}`,
    )
  })

  it("lets only Administration edit its identity and keeps the accessibility preferences", async () => {
    world.assignments = [makeAssignment({ role: "administrador", careerId: null, careerLabel: null }), makeAssignment({ id: SECOND_ROLE, role: "docente" })]
    profile = { ...profile, accessibility: { font_size: "grande", reduce_motion: true, "0": 1 } }
    const json = JSON.parse((await call(showSession, "/api/v1/session")).text)
    expect(json.user).toMatchObject({ can_edit_identity: true, accessibility: { font_size: "grande", reduce_motion: true, "0": 1 } })
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

  it("picks the sole role, answers it and keeps it in the session, like Laravel", async () => {
    world.sessions.set(SESSION_ID, { payload: sessionPayload(loggedInAttributes({ active_role_assignment_id: undefined })), lastActivity: NOW })
    const { status, text } = await call(showSession, "/api/v1/session")
    expect(status).toBe(200)
    expect(JSON.parse(text).active_role.id).toBe(golden.roleId)
    expect(JSON.parse(storedJson(world, SESSION_ID) ?? "{}").active_role_assignment_id).toBe(golden.roleId)
  })
})
