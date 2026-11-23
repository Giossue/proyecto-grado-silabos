// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { dashboardDeadline, dashboardIndex, type ConvocationRecord, type DashboardRepository, type ProcessRecord, type TeacherSyllabus } from "./dashboard"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const PROCESS = "10000000-0000-4000-8000-000000000001"
const CONVOCATION = "20000000-0000-4000-8000-000000000001"

let world: FakeWorld
let inProgress: ProcessRecord | null
let latest: ProcessRecord | null
let convocation: ConvocationRecord | null
let teacherSyllabi: TeacherSyllabus[]
let finalized: ConvocationRecord | null
let forwarded: Request[]
let calls: string[]

const process = (overrides: Partial<ProcessRecord> = {}): ProcessRecord => ({
  id: PROCESS,
  state: "abierto",
  period: "2026-2",
  startsOn: "2026-11-01",
  dueOn: "2026-11-30",
  periodEndsOn: "2027-03-15",
  ...overrides,
})

const repository = (): DashboardRepository => ({
  async inProgressProcess() {
    calls.push("inProgress")
    return inProgress
  },
  async latestProcess() {
    calls.push("latest")
    return latest
  },
  async convocation(careerId, processId) {
    calls.push(`convocation:${careerId}:${processId}`)
    return convocation
  },
  async teacherOpenSyllabi(userId, careerId) {
    calls.push(`teacher:${userId}:${careerId}`)
    return teacherSyllabi
  },
  async finalizedTeacherConvocation(userId, processId, careerId) {
    calls.push(`finalized:${userId}:${processId}:${careerId}`)
    return finalized
  },
  async libraryCounts() {
    return { pendiente: 3, firmado: 0, devuelto: 2, reemplazado: 1 }
  },
})

function asRole(role: string, careerId: string | null = "c-1") {
  world.assignments = [makeAssignment({ role, careerId })]
}

async function call(handler: typeof dashboardDeadline, path: string, today = "2026-11-23") {
  const response = await handler(apiRequest(path, { cookie }), { bridge: fakeDeps(world, forwarded), dashboard: repository(), today: () => today })
  const text = await response.text()
  return { status: response.status, text, json: response.status === 299 ? null : (JSON.parse(text) as Record<string, unknown>) }
}

const deadline = (overrides: Record<string, unknown> = {}) => ({
  period: "2026-2",
  starts_at: "2026-11-01",
  due_at: "2026-11-30",
  state: "active",
  days_until_start: 0,
  days_until_due: 7,
  convocation_id: null,
  paused_by: null,
  classes_ended: false,
  career_pending: false,
  ...overrides,
})

beforeEach(() => {
  world = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [],
  }
  asRole("docente")
  inProgress = process()
  latest = process()
  convocation = null
  teacherSyllabi = []
  finalized = null
  forwarded = []
  calls = []
})

describe("dashboard deadline", () => {
  it("shows the teacher the nearest open deadline", async () => {
    teacherSyllabi = [
      { convocation: { id: "late", state: "abierta" }, process: process({ dueOn: "2026-12-10" }), dueAt: 2000 },
      { convocation: { id: CONVOCATION, state: "abierta" }, process: process(), dueAt: 1000 },
    ]
    const response = await call(dashboardDeadline, "/api/v1/dashboard/deadline")
    expect(response.status).toBe(200)
    expect(response.text).toBe(
      '{"deadline":{"period":"2026-2","starts_at":"2026-11-01","due_at":"2026-11-30","state":"active","days_until_start":0,"days_until_due":7,"convocation_id":"20000000-0000-4000-8000-000000000001","paused_by":null,"classes_ended":false,"career_pending":false}}',
    )
    expect(calls[0]).toBe(`teacher:${golden.userId}:c-1`)
  })

  it("names who paused, and tells upcoming and overdue apart", async () => {
    teacherSyllabi = [{ convocation: { id: CONVOCATION, state: "pausada" }, process: process(), dueAt: 1 }]
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline")).json).toEqual({ deadline: deadline({ state: "paused", paused_by: "coordinacion", convocation_id: CONVOCATION }) })
    teacherSyllabi = [{ convocation: { id: CONVOCATION, state: "abierta" }, process: process({ state: "pausado" }), dueAt: 1 }]
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline")).json?.deadline).toMatchObject({ state: "paused", paused_by: "administracion" })
    teacherSyllabi = [{ convocation: { id: CONVOCATION, state: "abierta" }, process: process(), dueAt: 1 }]
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline", "2026-10-20")).json?.deadline).toMatchObject({ state: "upcoming", days_until_start: 12, days_until_due: 41 })
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline", "2027-03-16")).json?.deadline).toMatchObject({ state: "overdue", days_until_due: 0, classes_ended: true })
  })

  it("shows the teacher a pause, then the last finalized process, without syllabi", async () => {
    convocation = { id: CONVOCATION, state: "pausada" }
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline")).json).toEqual({
      deadline: deadline({ state: "paused", paused_by: "coordinacion", convocation_id: CONVOCATION }),
    })
    convocation = { id: CONVOCATION, state: "abierta" }
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline")).json).toEqual({ deadline: null })
    inProgress = null
    latest = process({ state: "cerrado" })
    finalized = { id: CONVOCATION, state: "cerrada" }
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline")).json).toEqual({ deadline: deadline({ state: "closed", convocation_id: CONVOCATION }) })
    finalized = null
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline")).json).toEqual({ deadline: null })
  })

  it("gives Coordination its career convocation and marks it pending until it opens", async () => {
    asRole("coordinador")
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline")).json).toEqual({ deadline: deadline({ career_pending: true }) })
    expect(calls).toContain(`convocation:c-1:${PROCESS}`)
    convocation = { id: CONVOCATION, state: "abierta" }
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline")).json).toEqual({ deadline: deadline({ convocation_id: CONVOCATION }) })
    latest = null
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline")).json).toEqual({ deadline: null })
  })

  it("shows Administration only a pause or a finalized process, and the library always", async () => {
    asRole("administrador", null)
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline")).json).toEqual({ deadline: null })
    latest = process({ state: "pausado" })
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline")).json).toEqual({ deadline: deadline({ state: "paused", paused_by: "administracion" }) })
    asRole("bibliotecario", null)
    latest = process()
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline")).json).toEqual({ deadline: deadline() })
  })
})

describe("dashboard", () => {
  it("serves the library metrics and deadline", async () => {
    asRole("bibliotecario", null)
    const response = await call(dashboardIndex, "/api/v1/dashboard")
    expect(response.status).toBe(200)
    expect(response.json).toEqual({
      metrics: [
        { key: "library_pending", label: "En revisión", value: 3, suffix: null, hint: "Enviados por los docentes; falta verificar la bibliografía" },
        { key: "library_signed", label: "Aprobados", value: 0, suffix: null, hint: "Bibliografía aprobada y firmada" },
        { key: "library_commented", label: "Corrección solicitada", value: 2, suffix: null, hint: "Con observaciones para el docente" },
      ],
      setup: null,
      deadline: deadline(),
      coordination_convocation: null,
    })
    expect(response.text).toContain('"label":"En revisi\\u00f3n"')
  })

  it("serves the teacher dashboard without metrics", async () => {
    expect((await call(dashboardIndex, "/api/v1/dashboard")).json).toEqual({ metrics: [], setup: null, deadline: null, coordination_convocation: null })
  })

  it("leaves Administration and Coordination to Laravel", async () => {
    for (const role of ["administrador", "coordinador"]) {
      asRole(role)
      expect((await call(dashboardIndex, "/api/v1/dashboard")).status).toBe(299)
    }
    expect(forwarded).toHaveLength(2)
  })

  it("asks for an active role", async () => {
    world.assignments = []
    world.sessions.set(SESSION_ID, { payload: sessionPayload(loggedInAttributes({ active_role_assignment_id: undefined })), lastActivity: NOW })
    expect((await call(dashboardIndex, "/api/v1/dashboard")).status).toBe(409)
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline")).status).toBe(409)
  })
})
