// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, storedJson, type FakeWorld } from "../auth/testing"
import { markAllNotificationsRead, markNotificationRead, openNotification, type NotificationWriteRepository, type StoredNotification } from "./notifications"
import type { DestinationLookups } from "./notificationDestination"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const OWN = "0b3f1c6e-1d2a-4c55-9b1e-1a2b3c4d5e6f"
const FOREIGN = "0b3f1c6e-1d2a-4c55-9b1e-1a2b3c4d5e70"
const MISSING = "0b3f1c6e-1d2a-4c55-9b1e-1a2b3c4d5e71"
const OTHER_USER = "c0000000-0000-4000-8000-000000000009"
const MODEL = "App\\\\Modules\\\\Operations\\\\Infrastructure\\\\Persistence\\\\Models\\\\InternalNotification"
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'

let world: FakeWorld
let stored: (StoredNotification & { visible: boolean })[]
let writes: string[]
let lookups: DestinationLookups

function notice(overrides: Partial<StoredNotification & { visible: boolean }> = {}): StoredNotification & { visible: boolean } {
  return {
    id: OWN,
    userId: golden.userId,
    type: "documento.exportacion_fallida",
    resourceType: "artefacto_exportacion",
    resourceId: null,
    readAt: null,
    visible: true,
    ...overrides,
  }
}

const repository = (): NotificationWriteRepository => ({
  async find(id) {
    writes.push(`find:${id}`)
    return stored.find((item) => item.id === id) ?? null
  },
  async markRead(id, at) {
    writes.push(`read:${id}:${at}`)
    const item = stored.find((candidate) => candidate.id === id)
    if (item) item.readAt = String(at)
  },
  async markAllRead(userId, at) {
    writes.push(`read-all:${userId}:${at}`)
    for (const item of stored) if (item.userId === userId && item.visible && item.readAt === null) item.readAt = String(at)
  },
})

const noLookups = (): DestinationLookups => ({
  processCareerIds: async () => [],
  convocationCareerIds: async () => [],
  syllabusExists: async () => false,
  syllabusCareerId: async () => null,
  latestRevisionId: async () => null,
  teacherAssignmentIds: async () => [],
  artifactRevision: async () => null,
})

function deps() {
  return { bridge: fakeDeps(world), notifications: repository(), lookups }
}

function post(path: string, headers: Record<string, string> = {}): Request {
  return apiRequest(path, { method: "POST", cookie, headers: { "x-csrf-token": golden.csrfToken, ...headers } })
}

async function read(response: Response): Promise<{ status: number; text: string }> {
  return { status: response.status, text: await response.text() }
}

beforeEach(() => {
  world = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW - 60 }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "administrador", careerId: null, careerLabel: null })],
  }
  stored = [notice(), notice({ id: FOREIGN, userId: OTHER_USER })]
  writes = []
  lookups = noLookups()
})

describe("POST /api/v1/notifications/read-all", () => {
  it("marks only the current period's unread notices of the user and answers Laravel's message", async () => {
    const old = notice({ id: MISSING, visible: false })
    stored.push(old)
    expect(await read(await markAllNotificationsRead(post("/api/v1/notifications/read-all"), deps()))).toEqual({
      status: 200,
      text: '{"message":"Todas las notificaciones quedaron marcadas como leídas."}',
    })
    expect(writes).toEqual([`read-all:${golden.userId}:${NOW}`])
    expect(stored[0].readAt).toBe(String(NOW))
    expect(stored[1].readAt).toBeNull()
    expect(old.readAt).toBeNull()
    expect(world.sessions.get(SESSION_ID)?.lastActivity).toBe(NOW)
  })

  it("needs the session, the CSRF token and an active account before writing", async () => {
    const guest = new Request("http://localhost:3000/api/v1/notifications/read-all", { method: "POST", headers: { accept: "application/json" } })
    expect(await read(await markAllNotificationsRead(guest, deps()))).toEqual({ status: 401, text: '{"message":"Unauthenticated."}' })
    expect((await markAllNotificationsRead(post("/api/v1/notifications/read-all", { "x-csrf-token": "other" }), deps())).status).toBe(419)
    world.users = [makeUser({ active: false })]
    expect((await markAllNotificationsRead(post("/api/v1/notifications/read-all"), deps())).status).toBe(403)
    expect(writes).toEqual([])
  })
})

describe("POST /api/v1/notifications/{notification}/read", () => {
  it("marks the user's own notice once and keeps the first read time", async () => {
    const first = await read(await markNotificationRead(post(`/api/v1/notifications/${OWN}/read`), OWN, deps()))
    expect(first).toEqual({ status: 200, text: '{"message":"Notificación marcada como leída."}' })
    expect(stored[0].readAt).toBe(String(NOW))
    writes = []
    expect((await markNotificationRead(post(`/api/v1/notifications/${OWN}/read`), OWN, deps())).status).toBe(200)
    expect(writes).toEqual([`find:${OWN}`])
  })

  it("forbids another user's notice without touching it", async () => {
    expect(await read(await markNotificationRead(post(`/api/v1/notifications/${FOREIGN}/read`), FOREIGN, deps()))).toEqual({
      status: 403,
      text: FORBIDDEN,
    })
    expect(stored[1].readAt).toBeNull()
    expect(writes).toEqual([`find:${FOREIGN}`])
  })

  it("answers Laravel's 404 for a missing or malformed id, before the account checks", async () => {
    world.users = [makeUser({ active: false })]
    expect(await read(await markNotificationRead(post(`/api/v1/notifications/${MISSING}/read`), MISSING, deps()))).toEqual({
      status: 404,
      text: `{"message":"No query results for model [${MODEL}] ${MISSING}"}`,
    })
    expect(await read(await markNotificationRead(post("/api/v1/notifications/abc/read"), "abc", deps()))).toEqual({
      status: 404,
      text: `{"message":"No query results for model [${MODEL}] abc"}`,
    })
    expect(writes).toEqual([`find:${MISSING}`])
  })
})

describe("POST /api/v1/notifications/{notification}/open", () => {
  it("marks a failed export notice read without a screen, now that Auditoría is gone", async () => {
    expect(await read(await openNotification(post(`/api/v1/notifications/${OWN}/open`), OWN, deps()))).toEqual({
      status: 200,
      text: '{"path":null,"role_changed":false,"message":"Este aviso ya no tiene una pantalla disponible para sus roles actuales."}',
    })
    expect(stored[0].readAt).toBe(String(NOW))
  })

  it("marks it read and returns the screen of the active role", async () => {
    world.assignments = [makeAssignment()]
    stored[0] = notice({ type: "convocatoria.abierta", resourceType: "convocatoria", resourceId: MISSING })
    lookups = { ...noLookups(), convocationCareerIds: async () => ["c-1"] }
    expect(await read(await openNotification(post(`/api/v1/notifications/${OWN}/open`), OWN, deps()))).toEqual({
      status: 200,
      text: '{"path":"/docente/mis-silabos","role_changed":false}',
    })
    expect(stored[0].readAt).toBe(String(NOW))
  })

  it("says when the notice has no screen for the current roles", async () => {
    stored[0] = notice({ type: "silabo.correccion_solicitada", resourceType: "silabo", resourceId: MISSING })
    expect(await read(await openNotification(post(`/api/v1/notifications/${OWN}/open`), OWN, deps()))).toEqual({
      status: 200,
      text: '{"path":null,"role_changed":false,"message":"Este aviso ya no tiene una pantalla disponible para sus roles actuales."}',
    })
    expect(stored[0].readAt).toBe(String(NOW))
  })

  it("switches the active role in the session when opening needs it, like SelectActiveRole", async () => {
    const coordinator = makeAssignment({ id: "r-coord", role: "coordinador", careerId: "c-1" })
    world.assignments = [makeAssignment(), coordinator]
    world.sessions.set(SESSION_ID, { payload: sessionPayload(loggedInAttributes({ active_role_assignment_id: "r-coord" })), lastActivity: NOW - 60 })
    stored[0] = notice({ type: "silabo.aprobado", resourceType: "silabo", resourceId: MISSING })
    lookups = { ...noLookups(), syllabusExists: async () => true, teacherAssignmentIds: async () => [golden.roleId] }
    const response = await openNotification(post(`/api/v1/notifications/${OWN}/open`), OWN, deps())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ role_changed: true })
    expect(stored[0].readAt).not.toBeNull()
    expect(world.sessions.has(SESSION_ID)).toBe(true)
    const stored2 = [...world.sessions.keys()].filter((id) => id !== SESSION_ID)
    expect(stored2).toHaveLength(1)
    expect(JSON.parse(storedJson(world, stored2[0]) ?? "{}").active_role_assignment_id).toBe(golden.roleId)
  })

  it("forbids another user's notice", async () => {
    expect(await read(await openNotification(post(`/api/v1/notifications/${FOREIGN}/open`), FOREIGN, deps()))).toEqual({
      status: 403,
      text: FORBIDDEN,
    })
    expect(stored[1].readAt).toBeNull()
  })
})
