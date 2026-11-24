// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { phpJsonEncode } from "../laravel/phpJson"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import {
  convocationDetail,
  convocations,
  pauseConvocation,
  type ConvocationListFilters,
  type ConvocationRecord,
  type ConvocationRepository,
  type ConvocationSyllabus,
  type ProcessListRow,
} from "./convocations"

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'
const CAREER = "c0000000-0000-4000-8000-000000000001"
const CONVOCATION = "cc000000-0000-4000-8000-000000000001"
const PROCESS = "cd000000-0000-4000-8000-000000000001"

let world: FakeWorld
let forwarded: Request[]
let listCalls: { filters: ConvocationListFilters; page: number }[]
let rows: ProcessListRow[]
let record: ConvocationRecord | null
let lockedState: string | null
let syllabi: ConvocationSyllabus[]
let log: string[]
let audits: AuditEventInput[]

const repository = (): ConvocationRepository => ({
  async page(filters, page) {
    listCalls.push({ filters, page })
    return { total: rows.length, items: rows }
  },
  async convocation(id) {
    return record !== null && record.id === id.toLowerCase() ? record : null
  },
  async syllabi() {
    return syllabi
  },
  async transaction(work) {
    log.push("begin")
    try {
      const result = await work({
        lockConvocation: async (id) => {
          log.push(`lock:${id}`)
          return lockedState
        },
        updateState: async (id, state) => {
          log.push(`state:${id}:${state}`)
        },
        recordAudit: async (event) => {
          log.push("audit")
          audits.push(event)
        },
      })
      log.push("commit")
      return result
    } catch (error) {
      log.push("rollback")
      audits = []
      throw error
    }
  },
})

const deps = () => ({ bridge: fakeDeps(world, forwarded), convocations: repository(), now: () => NOW })

async function send(handler: (request: Request) => Promise<Response>, path: string, method = "GET") {
  const response = await handler(apiRequest(path, { cookie, method, headers: { "x-csrf-token": golden.csrfToken } }))
  const text = await response.text()
  return { status: response.status, text, json: text.startsWith("{") ? (JSON.parse(text) as Record<string, unknown>) : null }
}

const syllabus = (overrides: Partial<ConvocationSyllabus> = {}): ConvocationSyllabus => ({
  id: "50000000-0000-4000-8000-000000000001",
  subject: "Redes",
  code: "SW-501",
  liveSubject: "Redes",
  state: "sin_iniciar",
  parallel: "A",
  startedAt: null,
  latestRevision: null,
  teachers: ["Ana", "Ana", "Luis"],
  ...overrides,
})

beforeEach(() => {
  world = {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "coordinador", careerId: CAREER })],
  }
  forwarded = []
  listCalls = []
  rows = [
    { processId: PROCESS, processState: "abierto", period: "2026-2", convocationId: CONVOCATION, convocationState: "abierta", syllabiCount: 7 },
    { processId: "cd000000-0000-4000-8000-000000000002", processState: "cerrado", period: "2026-1", convocationId: null, convocationState: null, syllabiCount: 0 },
  ]
  record = { id: CONVOCATION, careerId: CAREER, career: "Software", state: "abierta", processState: "abierto", period: "2026-2", startsOn: "2026-11-10", dueOn: "2026-12-10" }
  lockedState = "abierta"
  syllabi = []
  log = []
  audits = []
})

describe("GET /api/v1/coordination/convocations", () => {
  it("lists the institutional processes with the career's convocation", async () => {
    const { status, text } = await send((request) => convocations(request, deps()), "/api/v1/coordination/convocations?q=2026&state=all")
    expect(status).toBe(200)
    expect(listCalls).toEqual([{ filters: { careerId: CAREER, search: "2026", state: null }, page: 1 }])
    const json = JSON.parse(text)
    expect(json.filters).toEqual({ q: "2026", state: null })
    expect(json.convocations.data).toEqual([
      { id: CONVOCATION, process_id: PROCESS, name: "2026-2", state: "abierta", process_state: "abierto", period: "2026-2", template: "Plantilla institucional de sílabo", syllabi_count: 7 },
      { id: null, process_id: "cd000000-0000-4000-8000-000000000002", name: "2026-1", state: "sin_iniciar", process_state: "cerrado", period: "2026-1", template: "Plantilla institucional de sílabo", syllabi_count: 0 },
    ])
    expect(text).toBe(phpJsonEncode(json))
  })

  it("filters by state and validates like Laravel", async () => {
    await send((request) => convocations(request, deps()), "/api/v1/coordination/convocations?state=sin_iniciar&q=0")
    expect(listCalls[0].filters).toEqual({ careerId: CAREER, search: null, state: "sin_iniciar" })
    const { json } = await send((request) => convocations(request, deps()), "/api/v1/coordination/convocations?state=otro")
    expect(json?.errors).toEqual({ state: ["El valor seleccionado en estado no es válido."] })
  })

  it("is only for the coordinator", async () => {
    world.assignments = [makeAssignment({ role: "docente", careerId: CAREER })]
    expect((await send((request) => convocations(request, deps()), "/api/v1/coordination/convocations")).text).toBe(FORBIDDEN)
  })
})

describe("GET /api/v1/coordination/convocations/{convocation}", () => {
  it("shows the convocation with its syllabi sorted by live subject and parallel", async () => {
    syllabi = [
      syllabus({ id: "50000000-0000-4000-8000-000000000002", liveSubject: "Redes", parallel: "B", state: "en_revision", latestRevision: { id: "r2", stage: { approved: false, verified: true }, returnedBy: null } }),
      syllabus({ id: "50000000-0000-4000-8000-000000000003", liveSubject: "Álgebra", subject: "Algebra lineal", state: "correccion_solicitada", latestRevision: { id: "r3", stage: { approved: false, verified: false }, returnedBy: "biblioteca" } }),
      syllabus({ liveSubject: "Bases", state: "borrador", startedAt: "2026-11-11T10:00:00+00:00" }),
    ]
    const { status, text } = await send((request) => convocationDetail(request, CONVOCATION, deps()), `/api/v1/coordination/convocations/${CONVOCATION}`)
    expect(status).toBe(200)
    const json = JSON.parse(text)
    expect(json.convocation).toMatchObject({
      id: CONVOCATION,
      name: "Software · 2026-2",
      state: "abierta",
      process: { name: "2026-2", state: "abierto" },
      period: "2026-2",
      template: "Plantilla institucional de sílabo",
      start_date: "2026-11-10",
      draft_deadline: "2026-12-10",
      counts: { total: 3, not_started: 0, draft: 1, in_review: 1, approved: 0 },
    })
    expect(json.convocation.syllabi).toEqual([
      { id: "50000000-0000-4000-8000-000000000001", subject: "Redes", code: "SW-501", state: "borrador", stage: null, revision_id: null, returned_by: null, iniciado_en: "2026-11-11T10:00:00+00:00", parallels: ["A"], teachers: ["Ana", "Luis"] },
      { id: "50000000-0000-4000-8000-000000000002", subject: "Redes", code: "SW-501", state: "en_revision", stage: "coordinacion", revision_id: "r2", returned_by: null, iniciado_en: null, parallels: ["B"], teachers: ["Ana", "Luis"] },
      { id: "50000000-0000-4000-8000-000000000003", subject: "Algebra lineal", code: "SW-501", state: "correccion_solicitada", stage: null, revision_id: "r3", returned_by: "biblioteca", iniciado_en: null, parallels: ["A"], teachers: ["Ana", "Luis"] },
    ])
  })

  it("aborts with an empty 403 for another career and leaves unknown ones to Laravel", async () => {
    world.assignments = [makeAssignment({ role: "coordinador", careerId: "c0000000-0000-4000-8000-000000000009" })]
    const denied = await send((request) => convocationDetail(request, CONVOCATION, deps()), `/api/v1/coordination/convocations/${CONVOCATION}`)
    expect(denied).toMatchObject({ status: 403, text: '{\n    "message": ""\n}' })
    expect((await send((request) => convocationDetail(request, "cc000000-0000-4000-8000-00000000ffff", deps()), "/api/v1/coordination/convocations/x")).status).toBe(299)
  })
})

describe("POST /api/v1/coordination/convocations/{convocation}/pausar", () => {
  const pause = (id = CONVOCATION) => send((request) => pauseConvocation(request, id, deps()), `/api/v1/coordination/convocations/${id}/pausar`, "POST")

  it("pauses an open convocation under a row lock and audits it", async () => {
    const { status, text } = await pause()
    expect(status).toBe(200)
    expect(text).toBe(phpJsonEncode({ message: "Convocatoria en pausa. Los docentes de la carrera no editan ni envían; la malla queda editable." }))
    expect(log).toEqual(["begin", `lock:${CONVOCATION}`, `state:${CONVOCATION}:pausada`, "audit", "commit"])
    expect(audits).toEqual([
      { actorId: golden.userId, roleAssignmentId: golden.roleId, action: "convocatoria.pausada", resourceType: "convocatoria", resourceId: CONVOCATION, result: "exito", metadata: {}, occurredAt: NOW },
    ])
  })

  it("forbids pausing a convocation that is not open or belongs to another career", async () => {
    record = { ...(record as ConvocationRecord), state: "pausada" }
    expect((await pause()).text).toBe(FORBIDDEN)
    record = { ...(record as ConvocationRecord), state: "abierta" }
    world.assignments = [makeAssignment({ role: "coordinador", careerId: "c0000000-0000-4000-8000-000000000009" })]
    expect((await pause()).text).toBe(FORBIDDEN)
    expect(log).toEqual([])
  })

  it("rejects the pause when another session changed the state first", async () => {
    lockedState = "cerrada"
    const { status, json } = await pause()
    expect(status).toBe(422)
    expect(json).toEqual({ message: "Solo una convocatoria abierta puede pausarse.", errors: { convocation: ["Solo una convocatoria abierta puede pausarse."] } })
    expect(log).toEqual(["begin", `lock:${CONVOCATION}`, "rollback"])
  })

  it("leaves unknown convocations to Laravel", async () => {
    expect((await pause("cc000000-0000-4000-8000-00000000ffff")).status).toBe(299)
  })
})
