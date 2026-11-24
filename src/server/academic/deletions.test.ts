// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { deleteCareerRecord, deleteGovernanceRecord, deleteParallel, type AcademicDeletionStore, type DeletionTx } from "./deletions"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const CAREER = "01a1c5bc-79ca-7331-8f0f-66d63f61c699"
const PERIOD = "01a1c5bc-7a00-7000-8000-000000000001"
const ASSIGNMENT = "01a1c5bc-7a00-7000-8000-000000000002"
const PARALLEL = "01a1c5bc-7a00-7000-8000-000000000003"
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'

type Row = Record<string, unknown>

let world: FakeWorld
let forwarded: Request[]
let activeCareers: Set<string>
let periods: Map<string, { code: string; hasProcess: boolean }>
let assignments: Map<string, { careerId: string }>
let parallels: Map<string, { careerId: string; code: string; teacherAssignments: number; syllabi: { touched: boolean }[] }>
let committed: Row[]
let locks: string[]
let transactions: number

const store = (): AcademicDeletionStore => ({
  careerActive: async (id) => activeCareers.has(id),
  async transaction(work) {
    transactions += 1
    const staged: Row[] = []
    const tx: DeletionTx = {
      async lockPeriod(id) {
        locks.push(`periodo:${id}`)
        const period = periods.get(id)
        return period ? { id, code: period.code } : null
      },
      periodHasProcess: async (id) => periods.get(id)?.hasProcess ?? false,
      async deletePeriod(id) {
        staged.push({ op: "delete periodos_academicos", id })
      },
      async lockTeacherAssignment(id, careerId) {
        locks.push(`asignacion_docente:${id}:${careerId}`)
        return assignments.get(id)?.careerId === careerId ? { id } : null
      },
      async deleteTeacherAssignment(id) {
        staged.push({ op: "delete asignaciones_paralelo", id })
      },
      async lockParallel(id, careerId) {
        locks.push(`paralelo:${id}:${careerId}`)
        const parallel = parallels.get(id)
        return parallel?.careerId === careerId ? { id, code: parallel.code } : null
      },
      parallelHasTeacherAssignment: async (id) => (parallels.get(id)?.teacherAssignments ?? 0) > 0,
      parallelHasTouchedSyllabus: async (id) => (parallels.get(id)?.syllabi ?? []).some((syllabus) => syllabus.touched),
      async deleteParallelSyllabi(id) {
        staged.push({ op: "delete silabos", parallel: id, count: parallels.get(id)?.syllabi.length ?? 0 })
      },
      async deleteParallel(id) {
        staged.push({ op: "delete paralelos", id })
      },
    }
    const result = await work(tx)
    committed.push(...staged)
    return result
  },
})

const deps = () => ({ bridge: fakeDeps(world, forwarded), store: store() })

function remove(path: string, headers: Record<string, string> = { "x-csrf-token": golden.csrfToken }): Request {
  return apiRequest(path, { method: "DELETE", cookie, headers })
}

function asRole(role: string, careerId: string | null) {
  world.assignments = [makeAssignment({ role, careerId })]
}

async function read(response: Response): Promise<{ status: number; text: string }> {
  return { status: response.status, text: await response.text() }
}

beforeEach(() => {
  world = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW - 60 }]]),
    users: [makeUser()],
    assignments: [],
  }
  forwarded = []
  activeCareers = new Set([CAREER])
  periods = new Map([[PERIOD, { code: "Abril-Agosto 2027", hasProcess: false }]])
  assignments = new Map([[ASSIGNMENT, { careerId: CAREER }]])
  parallels = new Map([[PARALLEL, { careerId: CAREER, code: "A", teacherAssignments: 0, syllabi: [{ touched: false }] }]])
  committed = []
  locks = []
  transactions = 0
})

describe("DELETE /api/v1/admin/academic/{entity}/{record}", () => {
  const path = `/api/v1/admin/academic/periodo/${PERIOD}`

  it("deletes a period without a convocation, locking it first", async () => {
    asRole("administrador", null)
    expect(await read(await deleteGovernanceRecord(remove(path), "periodo", PERIOD, deps()))).toEqual({
      status: 200,
      text: '{"message":"Registro institucional eliminado."}',
    })
    expect(locks).toEqual([`periodo:${PERIOD}`])
    expect(committed).toEqual([
      { op: "delete periodos_academicos", id: PERIOD },
    ])
  })

  it("keeps a period with a convocation and answers Laravel's 422", async () => {
    asRole("administrador", null)
    periods.set(PERIOD, { code: "Abril-Agosto 2027", hasProcess: true })
    const message = "Este per\\u00edodo ya tiene una convocatoria con su historial, por eso no se puede eliminar."
    expect(await read(await deleteGovernanceRecord(remove(path), "periodo", PERIOD, deps()))).toEqual({
      status: 422,
      text: `{"message":"${message}","errors":{"record":["${message}"]}}`,
    })
    expect(committed).toEqual([])
  })

  it.each(["facultad", "carrera", "asignatura", "cualquiera"])("refuses to delete a %s with Laravel's 403 message", async (entity) => {
    asRole("administrador", null)
    expect(await read(await deleteGovernanceRecord(remove(`/api/v1/admin/academic/${entity}/${PERIOD}`), entity, PERIOD, deps()))).toEqual({
      status: 403,
      text: '{"message":"Este registro no se elimina: desact\\u00edvelo."}',
    })
    expect(transactions).toBe(0)
  })

  it("answers the generic 403 outside the administration role", async () => {
    asRole("coordinador", CAREER)
    expect(await read(await deleteGovernanceRecord(remove(path), "periodo", PERIOD, deps()))).toEqual({ status: 403, text: FORBIDDEN })
    expect(transactions).toBe(0)
  })

  it("answers 419 without the CSRF token and writes nothing", async () => {
    asRole("administrador", null)
    const response = await deleteGovernanceRecord(remove(path, {}), "periodo", PERIOD, deps())
    expect(response.status).toBe(419)
    expect(transactions).toBe(0)
  })

  it("lets Laravel answer a missing period after rolling back", async () => {
    asRole("administrador", null)
    periods.clear()
    expect((await deleteGovernanceRecord(remove(path), "periodo", PERIOD, deps())).status).toBe(299)
    expect(forwarded).toHaveLength(1)
    expect(committed).toEqual([])
  })

  it("lets Laravel answer a non-UUID period id", async () => {
    asRole("administrador", null)
    expect((await deleteGovernanceRecord(remove("/api/v1/admin/academic/periodo/abc"), "periodo", "abc", deps())).status).toBe(299)
    expect(transactions).toBe(0)
  })
})

describe("DELETE /api/v1/coordination/academic/{entity}/{record}", () => {
  const path = `/api/v1/coordination/academic/asignacion_docente/${ASSIGNMENT}`

  it("deletes a teacher assignment of the coordinator's career", async () => {
    asRole("coordinador", CAREER)
    expect(await read(await deleteCareerRecord(remove(path), "asignacion_docente", ASSIGNMENT, deps()))).toEqual({
      status: 200,
      text: '{"message":"Registro acad\\u00e9mico eliminado."}',
    })
    expect(locks).toEqual([`asignacion_docente:${ASSIGNMENT}:${CAREER}`])
    expect(committed).toEqual([
      { op: "delete asignaciones_paralelo", id: ASSIGNMENT },
    ])
  })

  it("lets Laravel answer another career's assignment, a non-UUID id and any other entity", async () => {
    asRole("coordinador", CAREER)
    assignments.set(ASSIGNMENT, { careerId: "otra" })
    expect((await deleteCareerRecord(remove(path), "asignacion_docente", ASSIGNMENT, deps())).status).toBe(299)
    expect((await deleteCareerRecord(remove("/api/v1/coordination/academic/asignacion_docente/x"), "asignacion_docente", "x", deps())).status).toBe(404)
    expect((await deleteCareerRecord(remove(`/api/v1/coordination/academic/teachers/${ASSIGNMENT}`), "teachers", ASSIGNMENT, deps())).status).toBe(404)
    expect(forwarded).toHaveLength(1)
    expect(committed).toEqual([])
  })

  it("answers the generic 403 to the administration and to an inactive career", async () => {
    asRole("administrador", null)
    expect(await read(await deleteCareerRecord(remove(path), "asignacion_docente", ASSIGNMENT, deps()))).toEqual({ status: 403, text: FORBIDDEN })
    asRole("coordinador", CAREER)
    activeCareers.clear()
    expect(await read(await deleteCareerRecord(remove(path), "asignacion_docente", ASSIGNMENT, deps()))).toEqual({ status: 403, text: FORBIDDEN })
    expect(transactions).toBe(0)
  })
})

describe("DELETE /api/v1/coordination/academic/parallels/{parallel}", () => {
  const path = `/api/v1/coordination/academic/parallels/${PARALLEL}`

  it("deletes the parallel and its untouched syllabi", async () => {
    asRole("coordinador", CAREER)
    expect(await read(await deleteParallel(remove(path), PARALLEL, deps()))).toEqual({ status: 200, text: '{"message":"Paralelo eliminado."}' })
    expect(locks).toEqual([`paralelo:${PARALLEL}:${CAREER}`])
    expect(committed).toEqual([
      { op: "delete silabos", parallel: PARALLEL, count: 1 },
      { op: "delete paralelos", id: PARALLEL },
    ])
  })

  it("keeps a parallel with a teacher assignment", async () => {
    asRole("coordinador", CAREER)
    parallels.set(PARALLEL, { careerId: CAREER, code: "A", teacherAssignments: 1, syllabi: [] })
    const message = "El paralelo tiene un docente asignado. Quite primero la asignaci\\u00f3n docente."
    expect(await read(await deleteParallel(remove(path), PARALLEL, deps()))).toEqual({
      status: 422,
      text: `{"message":"${message}","errors":{"record":["${message}"]}}`,
    })
    expect(committed).toEqual([])
  })

  it("keeps a parallel whose syllabus already has work", async () => {
    asRole("coordinador", CAREER)
    parallels.set(PARALLEL, { careerId: CAREER, code: "A", teacherAssignments: 0, syllabi: [{ touched: false }, { touched: true }] })
    const message = "El paralelo ya tiene s\\u00edlabo y no puede eliminarse."
    expect(await read(await deleteParallel(remove(path), PARALLEL, deps()))).toEqual({
      status: 422,
      text: `{"message":"${message}","errors":{"record":["${message}"]}}`,
    })
    expect(committed).toEqual([])
  })

  it("lets Laravel answer another career's parallel and a non-UUID id", async () => {
    asRole("coordinador", CAREER)
    parallels.set(PARALLEL, { careerId: "otra", code: "A", teacherAssignments: 0, syllabi: [] })
    expect((await deleteParallel(remove(path), PARALLEL, deps())).status).toBe(299)
    expect((await deleteParallel(remove("/api/v1/coordination/academic/parallels/x"), "x", deps())).status).toBe(404)
    expect(committed).toEqual([])
  })

  it("answers the generic 403 to a teacher", async () => {
    asRole("docente", CAREER)
    expect(await read(await deleteParallel(remove(path), PARALLEL, deps()))).toEqual({ status: 403, text: FORBIDDEN })
    expect(transactions).toBe(0)
  })
})
