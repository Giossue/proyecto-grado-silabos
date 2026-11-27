// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { GenerationRejected } from "../syllabus/inProgressWorkHelpers"
import {
  createSubjectRequirement,
  deleteCurriculumSubject,
  deleteSubjectRequirement,
  updateCurriculumConfiguration,
  updateSubjectLayout,
  type CurriculumDeps,
} from "./curriculumWrites"

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'
const CAREER = "01a1c5bc-79ca-7331-8f0f-66d63f61c699"
const OTHER_CAREER = "01a1c5bc-79ce-710d-bc0a-31ddfa3fcff9"
const ALGORITHMS = "01a1c5bc-7cbf-7091-860c-63a02b91e998"
const CALCULUS = "01a1c5bc-7d0a-7172-b554-6ae09a4da972"
const OOP = "01a1c5bc-7d48-72ab-864d-d2fd6fdad97f"
const CALCULUS_II = "01a1c5bc-7d89-73f1-bdc1-194c0bc420ca"
const DATA_STRUCTURES = "01a1c5bc-7dca-704c-9163-0c973d90f3fe"
const REQUIREMENT = "01a1c5bc-7e56-7195-a7f3-26b3ab4e935a"
const NEW_ID = "01a2aaaa-0000-7000-8000-000000000001"
const MALLA = "01a1c5bc-9000-7000-8000-000000000001"
const OLD_MALLA = "01a1c5bc-9000-7000-8000-000000000002"
const OTHER_MALLA = "01a1c5bc-9000-7000-8000-000000000003"
const OLD_ALGORITHMS = "01a1c5bc-9100-7000-8000-000000000001"
const CYCLES: Record<string, { careerId: string; cycleCount: number }> = {
  [MALLA]: { careerId: CAREER, cycleCount: 4 },
  [OLD_MALLA]: { careerId: CAREER, cycleCount: 6 },
  [OTHER_MALLA]: { careerId: OTHER_CAREER, cycleCount: 8 },
}

type Subject = { id: string; code: string; name: string; cycle: number | null; position: number; parallels: number; syllabi: number; malla?: string }

const inMalla = (subject: Subject, mallaId: string) => (subject.malla ?? MALLA) === mallaId
type Requirement = { id: string; subjectId: string; requirementId: string }

let world: FakeWorld
let log: string[]
let subjects: Subject[]
let requirements: Requirement[]
let locked: boolean
let finalized: boolean

function deps(): CurriculumDeps {
  return {
    bridge: fakeDeps(world),
    careerActive: async (id) => id === CAREER,
    async transaction(work) {
      log.push("begin")
      try {
        const result = await work({
          careerLocked: async () => locked,
          lockMalla: async (careerId, mallaId) => (CYCLES[mallaId]?.careerId === careerId ? { id: mallaId, cycleCount: CYCLES[mallaId].cycleCount } : null),
          maxCycle: async (mallaId) => Math.max(0, ...subjects.filter((subject) => inMalla(subject, mallaId)).map((subject) => subject.cycle ?? 0)),
          updateCycleCount: async (mallaId, count) => void log.push(`cycles:${mallaId}:${count}`),
          lockSubjects: async (mallaId, ids) =>
            subjects.filter((subject) => ids.includes(subject.id) && inMalla(subject, mallaId)).map((subject) => ({ id: subject.id, cycle: subject.cycle })),
          prerequisites: async () => requirements.map((item) => ({ subjectId: item.subjectId, requirementId: item.requirementId })),
          findRequirement: async (subjectId, requirementId) => {
            const found = requirements.find((item) => item.subjectId === subjectId && item.requirementId === requirementId)
            return found ? { id: found.id } : null
          },
          insertRequirement: async (subjectId, requirementId, ...rest: unknown[]) => {
            log.push(`requirement:${[subjectId, requirementId, ...rest].join(":")}`)
            return NEW_ID
          },
          lockRequirement: async (id) => {
            const found = requirements.find((item) => item.id === id)
            return found ? { id: found.id } : null
          },
          deleteRequirement: async (id) => void log.push(`delete-requirement:${id}`),
          lockSubject: async (id, mallaId) => {
            const found = subjects.find((subject) => subject.id === id && inMalla(subject, mallaId))
            return found ? { id: found.id, code: found.code, name: found.name, cycle: found.cycle, position: found.position } : null
          },
          subjectUsage: async (id) => {
            const found = subjects.find((subject) => subject.id === id) as Subject
            return { parallels: found.parallels, syllabi: found.syllabi }
          },
          deleteSubject: async (id) => void log.push(`delete-subject:${id}`),
          lockCycleSubjects: async (mallaId, cycle) =>
            subjects
              .filter((subject) => subject.cycle === cycle && inMalla(subject, mallaId))
              .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
              .map((subject) => ({ id: subject.id, position: subject.position })),
          setPosition: async (id, position) => void log.push(`position:${id}:${position}`),
          sync: async (confirmed, careerId) => void log.push(`sync:${confirmed}:${careerId}`),
          guard: async (confirmed, careerId, change) => {
            log.push(`guard:${confirmed}:${careerId}`)
            const result = await change()
            if (finalized && !confirmed) throw new GenerationRejected({ purge_required: ["finalizada"], purge_count: ["0"], purge_mode: ["convocatoria_finalizada"] })
            return result
          },
        })
        log.push("commit")
        return result
      } catch (error) {
        log.push("rollback")
        throw error
      }
    },
  }
}

async function send(method: string, path: string, body: unknown, handler: (request: Request) => Promise<Response>) {
  const request = new Request(apiRequest(path, { cookie, method, headers: { "x-csrf-token": golden.csrfToken, "content-type": "application/json" } }), {
    body: JSON.stringify(body),
  })
  const response = await handler(request)
  const text = await response.text()
  return { status: response.status, text, json: text.startsWith("{") ? (JSON.parse(text) as Record<string, unknown>) : null }
}

const base = (curriculum: string) => `/api/v1/coordination/academic/curriculum/${curriculum}`
const configure = (body: unknown, curriculum = MALLA) =>
  send("PATCH", `${base(curriculum)}/configuration`, body, (request) => updateCurriculumConfiguration(request, curriculum, deps()))
const relate = (body: unknown, curriculum = MALLA) => send("POST", `${base(curriculum)}/requirements`, body, (request) => createSubjectRequirement(request, curriculum, deps()))
const unrelate = (id: string, body: unknown = {}) => send("DELETE", `${base(MALLA)}/requirements/${id}`, body, (request) => deleteSubjectRequirement(request, MALLA, id, deps()))
const removeSubject = (id: string) => send("DELETE", `${base(MALLA)}/subjects/${id}`, {}, (request) => deleteCurriculumSubject(request, MALLA, id, deps()))
const reposition = (body: unknown) => send("PATCH", `${base(MALLA)}/subject-layout`, body, (request) => updateSubjectLayout(request, MALLA, deps()))

beforeEach(() => {
  world = {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "coordinador", careerId: CAREER })],
  }
  log = []
  locked = false
  finalized = false
  subjects = [
    { id: ALGORITHMS, code: "SW-B1-001", name: "Algoritmos", cycle: 1, position: 0, parallels: 1, syllabi: 1 },
    { id: CALCULUS, code: "SW-B1-004", name: "Cálculo I", cycle: 1, position: 1, parallels: 0, syllabi: 0 },
    { id: OOP, code: "SW-B2-006", name: "Programación", cycle: 2, position: 0, parallels: 1, syllabi: 0 },
    { id: CALCULUS_II, code: "SW-B2-009", name: "Cálculo II", cycle: 2, position: 1, parallels: 0, syllabi: 0 },
    { id: DATA_STRUCTURES, code: "SW-B3-011", name: "Estructura de Datos", cycle: 3, position: 0, parallels: 0, syllabi: 0 },
    { id: OLD_ALGORITHMS, code: "SW-B1-001", name: "Algoritmos (malla anterior)", cycle: 5, position: 0, parallels: 0, syllabi: 0, malla: OLD_MALLA },
  ]
  requirements = [
    { id: REQUIREMENT, subjectId: OOP, requirementId: ALGORITHMS },
    { id: "01a1c5bc-7e87-7399-bc43-30b65bb04952", subjectId: DATA_STRUCTURES, requirementId: OOP },
  ]
})

describe("PATCH /api/v1/coordination/academic/curriculum/{curriculum}/configuration", () => {
  it("changes the cycle count and keeps the syllabi in sync", async () => {
    const response = await configure({ cycle_count: "10" })
    expect(response.text).toBe('{"message":"Configuración de la malla actualizada."}')
    expect(log).toEqual(["begin", `guard:false:${CAREER}`, `cycles:${MALLA}:10`, `sync:false:${CAREER}`, "commit"])
  })

  it("configures the cycles of the addressed malla, checking only that malla's subjects", async () => {
    expect((await configure({ cycle_count: 4 }, OLD_MALLA)).json?.errors).toEqual({ cycle_count: ["Existen materias en el ciclo 5. Muévalas antes de reducir la malla."] })
    log = []
    expect((await configure({ cycle_count: 5 }, OLD_MALLA)).status).toBe(200)
    expect(log).toContain(`cycles:${OLD_MALLA}:5`)
  })

  it("answers Laravel's model 404 for a malla of another career and for the career id itself", async () => {
    for (const curriculum of [OTHER_MALLA, CAREER]) {
      expect(await configure({ cycle_count: 5 }, curriculum)).toMatchObject({ status: 404 })
    }
    expect(log.filter((line) => line.startsWith("cycles"))).toEqual([])
  })

  it("refuses fewer cycles than the last used one and an invalid count", async () => {
    expect((await configure({ cycle_count: 2 })).json?.errors).toEqual({ cycle_count: ["Existen materias en el ciclo 3. Muévalas antes de reducir la malla."] })
    expect((await configure({ cycle_count: 31 })).json?.errors).toEqual({ cycle_count: ["El campo cantidad de ciclos no debe ser mayor que 30."] })
  })

  it("refuses while a convocation is open, answers Laravel's model 404 for another curriculum and is forbidden for a teacher", async () => {
    locked = true
    expect((await configure({ cycle_count: 5 })).json?.errors).toEqual({ process: ["Proceso de sílabos activo"] })
    locked = false
    expect(await configure({ cycle_count: 5 }, "01a1c5bc-79ce-710d-bc0a-31ddfa3fcff9")).toMatchObject({ status: 404, text: '{"message":"No query results for model [App\\\\Modules\\\\Academic\\\\Infrastructure\\\\Persistence\\\\Models\\\\Career] 01a1c5bc-79ce-710d-bc0a-31ddfa3fcff9"}' })
    expect(await configure({ cycle_count: 5 }, "abc")).toMatchObject({ status: 404, text: '{"message":"The route api/v1/coordination/academic/curriculum/abc/configuration could not be found."}' })
    world.assignments = [makeAssignment({ role: "coordinador", careerId: OTHER_CAREER })]
    expect((await configure({ cycle_count: 5 })).text).toBe(FORBIDDEN)
  })

  it("a change that reaches a finalized process warns and rolls back unless confirmed", async () => {
    finalized = true
    expect((await configure({ cycle_count: 5 })).json?.errors).toEqual({ purge_required: ["finalizada"], purge_count: ["0"], purge_mode: ["convocatoria_finalizada"] })
    expect(log.at(-1)).toBe("rollback")
    expect((await configure({ cycle_count: 5, confirm_purge: true })).status).toBe(200)
    expect(log).toContain(`sync:true:${CAREER}`)
  })
})

describe("POST /api/v1/coordination/academic/curriculum/{curriculum}/requirements", () => {
  it("adds a prerequisite from an earlier cycle and saves it without a requirement type", async () => {
    expect((await relate({ subject_id: CALCULUS_II, requirement_id: CALCULUS })).json).toEqual({ message: "Prerrequisito agregado." })
    expect(log.filter((line) => line.startsWith("requirement") || line.startsWith("sync"))).toEqual([`requirement:${CALCULUS_II}:${CALCULUS}`, `sync:false:${CAREER}`])
  })

  it("rejects a requirement taken from another malla of the career", async () => {
    const across = await relate({ subject_id: DATA_STRUCTURES, requirement_id: OLD_ALGORITHMS })
    expect(across.status).toBe(422)
    expect(across.json?.errors).toEqual({ requirement_id: ["Ambas materias deben pertenecer a la malla actual."] })
    expect(log.some((line) => line.startsWith("requirement"))).toBe(false)
  })

  it("rejects a requirement of the same cycle instead of saving a corequisite", async () => {
    const response = await relate({ subject_id: CALCULUS, requirement_id: ALGORITHMS })
    expect(response.status).toBe(422)
    expect(response.json?.errors).toEqual({ requirement_id: ["Un prerrequisito debe estar en un ciclo anterior."] })
    expect(log.some((line) => line.startsWith("requirement") || line.startsWith("sync"))).toBe(false)
  })

  it("an existing relation changes nothing", async () => {
    expect((await relate({ subject_id: OOP, requirement_id: ALGORITHMS })).json).toEqual({ message: "Prerrequisito agregado." })
    expect(log).toEqual(["begin", `guard:false:${CAREER}`, "commit"])
  })

  it("enforces cycles, the curriculum and the acyclic prerequisites", async () => {
    const errors = async (body: Record<string, string>) => (await relate(body)).json?.errors
    expect(await errors({ subject_id: ALGORITHMS, requirement_id: OOP })).toEqual({ requirement_id: ["Un prerrequisito debe estar en un ciclo anterior."] })
    expect(await errors({ subject_id: OOP, requirement_id: "01a1c5bc-7eca-70e6-99e0-23ff7ff043d3" })).toEqual({
      requirement_id: ["Ambas materias deben pertenecer a la malla actual."],
    })
    subjects.push({ id: "01a2bbbb-0000-7000-8000-000000000001", code: "X", name: "Cero", cycle: 0, position: 0, parallels: 0, syllabi: 0 })
    requirements.push({ id: "01a2bbbb-0000-7000-8000-000000000002", subjectId: "01a2bbbb-0000-7000-8000-000000000001", requirementId: DATA_STRUCTURES })
    expect(await errors({ subject_id: DATA_STRUCTURES, requirement_id: "01a2bbbb-0000-7000-8000-000000000001" })).toEqual({
      requirement_id: ["La relación produciría un ciclo de prerrequisitos."],
    })
  })

  it("validates the request with the curriculum labels", async () => {
    expect((await relate({ subject_id: OOP, requirement_id: OOP })).json?.errors).toEqual({
      requirement_id: ["Los campos materia requisito y materia deben ser diferentes."],
    })
    expect((await relate({})).json?.errors).toEqual({
      subject_id: ["El campo materia es obligatorio."],
      requirement_id: ["El campo materia requisito es obligatorio."],
    })
  })
})

describe("DELETE /api/v1/coordination/academic/curriculum/{curriculum}/requirements/{requirement}", () => {
  it("removes the relation and keeps the syllabi in sync", async () => {
    expect((await unrelate(REQUIREMENT)).json).toEqual({ message: "Relación académica eliminada." })
    expect(log).toEqual(["begin", `guard:false:${CAREER}`, `delete-requirement:${REQUIREMENT}`, `sync:false:${CAREER}`, "commit"])
  })

  it("answers Laravel's model 404 for an unknown relation and reads the confirmation from the query", async () => {
    expect(await unrelate("01a2cccc-0000-7000-8000-000000000001")).toMatchObject({ status: 404, text: '{"message":"No query results for model [App\\\\Modules\\\\Academic\\\\Infrastructure\\\\Persistence\\\\Models\\\\SubjectRequirement] 01a2cccc-0000-7000-8000-000000000001"}' })
    finalized = true
    const confirmed = await deleteSubjectRequirement(
      new Request(apiRequest(`${base(MALLA)}/requirements/${REQUIREMENT}?confirm_purge=1`, { cookie, method: "DELETE", headers: { "x-csrf-token": golden.csrfToken } })),
      MALLA,
      REQUIREMENT,
      deps(),
    )
    expect(confirmed.status).toBe(200)
  })
})

describe("DELETE /api/v1/coordination/academic/curriculum/{curriculum}/subjects/{subject}", () => {
  it("deletes an unused subject with its relations", async () => {
    expect((await removeSubject(CALCULUS)).json).toEqual({ message: "Materia eliminada de la malla." })
    expect(log).toEqual(["begin", `guard:false:${CAREER}`, `delete-subject:${CALCULUS}`, `sync:false:${CAREER}`, "commit"])
  })

  it("refuses a subject with parallels or syllabi and says what it has", async () => {
    expect((await removeSubject(ALGORITHMS)).json?.errors).toEqual({
      subject: [
        "No se puede eliminar «Algoritmos»: tiene 1 paralelo y 1 sílabo. Estos son registros de otros procesos, no las relaciones de la malla. Archívela para conservar el historial.",
      ],
    })
    subjects[2].parallels = 3
    expect((await removeSubject(OOP)).json?.errors).toEqual({
      subject: ["No se puede eliminar «Programación»: tiene 3 paralelos. Estos son registros de otros procesos, no las relaciones de la malla. Archívela para conservar el historial."],
    })
    expect(await removeSubject("01a2cccc-0000-7000-8000-000000000001")).toMatchObject({ status: 404, text: '{"message":"No query results for model [App\\\\Modules\\\\Academic\\\\Infrastructure\\\\Persistence\\\\Models\\\\Subject] 01a2cccc-0000-7000-8000-000000000001"}' })
  })
})

describe("PATCH /api/v1/coordination/academic/curriculum/{curriculum}/subject-layout", () => {
  it("moves a subject inside its cycle, renumbering the others", async () => {
    subjects.push({ id: "01a2dddd-0000-7000-8000-000000000001", code: "SW-T2", name: "Segunda", cycle: 1, position: 1, parallels: 0, syllabi: 0 })
    expect((await reposition({ subject_id: ALGORITHMS, cycle: 1, position: 2 })).json).toEqual({ message: "Posición de la materia actualizada." })
    expect(log).toEqual([
      "begin",
      `guard:false:${CAREER}`,
      `position:${CALCULUS}:0`,
      `position:${ALGORITHMS}:2`,
      `sync:false:${CAREER}`,
      "commit",
    ])
  })

  it("only reorders inside the cycle and within the curriculum", async () => {
    expect((await reposition({ subject_id: ALGORITHMS, cycle: 2, position: 0 })).json?.errors).toEqual({ cycle: ["Una materia solo puede reordenarse dentro de su ciclo."] })
    expect((await reposition({ subject_id: ALGORITHMS, cycle: 5, position: 0 })).json?.errors).toEqual({ cycle: ["El ciclo excede la configuración de la malla."] })
    expect((await reposition({ subject_id: ALGORITHMS, cycle: 1, position: 1000 })).json?.errors).toEqual({ position: ["El campo posición no debe ser mayor que 999."] })
  })
})

describe("curriculum edits through /api/v1/admin/careers/{career}/academic/curriculum/{curriculum}", () => {
  const adminBase = (careerId: string, mallaId = careerId === CAREER ? MALLA : OTHER_MALLA) => `/api/v1/admin/careers/${careerId}/academic/curriculum/${mallaId}`

  it("lets the administrator configure, relate, reorder and delete in the requested career", async () => {
    world.assignments = [makeAssignment({ role: "administrador", careerId: null, careerLabel: null })]
    expect((await send("PATCH", `${adminBase(CAREER)}/configuration`, { cycle_count: "10" }, (request) => updateCurriculumConfiguration(request, MALLA, deps(), CAREER))).status).toBe(200)
    expect(log).toContain(`cycles:${MALLA}:10`)
    log = []
    expect((await send("POST", `${adminBase(CAREER)}/requirements`, { subject_id: CALCULUS_II, requirement_id: CALCULUS }, (request) => createSubjectRequirement(request, MALLA, deps(), CAREER))).status).toBe(200)
    expect(log).toContain(`requirement:${CALCULUS_II}:${CALCULUS}`)
    log = []
    expect((await send("DELETE", `${adminBase(CAREER)}/requirements/${REQUIREMENT}`, {}, (request) => deleteSubjectRequirement(request, MALLA, REQUIREMENT, deps(), CAREER))).status).toBe(200)
    expect(log).toContain(`delete-requirement:${REQUIREMENT}`)
    log = []
    expect((await send("PATCH", `${adminBase(CAREER)}/subject-layout`, { subject_id: CALCULUS, cycle: 1, position: 0 }, (request) => updateSubjectLayout(request, MALLA, deps(), CAREER))).status).toBe(200)
    log = []
    expect((await send("DELETE", `${adminBase(CAREER)}/subjects/${CALCULUS}`, {}, (request) => deleteCurriculumSubject(request, MALLA, CALCULUS, deps(), CAREER))).status).toBe(200)
    expect(log).toContain(`delete-subject:${CALCULUS}`)
  })

  it("answers 404 to the administrator for an inactive career", async () => {
    world.assignments = [makeAssignment({ role: "administrador", careerId: null, careerLabel: null })]
    const response = await send("PATCH", `${adminBase(OTHER_CAREER)}/configuration`, { cycle_count: "10" }, (request) => updateCurriculumConfiguration(request, OTHER_MALLA, deps(), OTHER_CAREER))
    expect(response.status).toBe(404)
    expect(log).toEqual([])
  })

  it("refuses a coordinator who sends another career and writes nothing", async () => {
    const attempts = [
      await send("PATCH", `${adminBase(OTHER_CAREER)}/configuration`, { cycle_count: "10" }, (request) => updateCurriculumConfiguration(request, OTHER_MALLA, deps(), OTHER_CAREER)),
      await send("DELETE", `${adminBase(OTHER_CAREER)}/subjects/${CALCULUS}`, {}, (request) => deleteCurriculumSubject(request, OTHER_MALLA, CALCULUS, deps(), OTHER_CAREER)),
    ]
    expect(attempts.map((attempt) => `${attempt.status} ${attempt.text}`)).toEqual([`403 ${FORBIDDEN}`, `403 ${FORBIDDEN}`])
    expect(log).toEqual([])
  })
})
