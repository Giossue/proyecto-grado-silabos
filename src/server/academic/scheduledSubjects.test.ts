// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, makeAssignment, loggedInAttributes, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { fakeTemplateStore, fieldId, goldenFields, goldenTemplate, type FakeTemplateWorld } from "../configuration/testing"
import type { AcademicStructureRepository, CareerLock, CareerRecord } from "./structure"
import { scheduledSubjects, type CareerParallelRecord, type ScheduledSubjectRecord, type ScheduledSubjectsDeps } from "./scheduledSubjects"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const CAREER = "01a1c5bc-79ca-7331-8f0f-66d63f61c699"
const ALGORITHMS = "01a1c5bc-7cbf-7091-860c-63a02b91e998"
const NETWORKS = "01a1c5bc-7cbf-7091-860c-63a02b91e999"
const RETIRED = "01a1c5bc-7cbf-7091-860c-63a02b91e990"
const RETIRED_WITH_PARALLEL = "01a1c5bc-7cbf-7091-860c-63a02b91e991"
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'
const MODALITIES =
  '[{"value":"Presencial","label":"Presencial"},{"value":"Semipresencial","label":"Semipresencial"},{"value":"En l\\u00ednea","label":"En l\\u00ednea"},{"value":"A distancia","label":"A distancia"},{"value":"H\\u00edbrida","label":"H\\u00edbrida"}]'
const SHIFTS = '[{"value":"matutina","label":"Matutina"},{"value":"vespertina","label":"Vespertina"},{"value":"nocturna","label":"Nocturna"}]'

let world: FakeWorld
let forwarded: Request[]
let careers: Map<string, CareerRecord>
let lock: CareerLock | null
let parallels: CareerParallelRecord[]
let subjects: ScheduledSubjectRecord[]
let marks: { syllabus: string[]; teacher: string[]; sent: string[]; started: string[] }
let templates: FakeTemplateWorld

function subject(overrides: Partial<ScheduledSubjectRecord>): ScheduledSubjectRecord {
  return { id: ALGORITHMS, code: "SW-B1-001", name: "Algoritmos", cycle: 1, active: true, generatesSyllabus: true, campus: "Campus Laguacoto", modality: "Presencial", ...overrides }
}

const academic = (): AcademicStructureRepository => ({
  activeCareer: async (id) => careers.get(id) ?? null,
  careerLock: async () => lock,
  curriculumSubjects: async () => [],
  requirements: async () => [],
  teacherAssignments: async () => [],
  careerTeachers: async () => [],
  pendingTeachers: async () => [],
  unassignedParallels: async () => [],
  teacherUsers: async () => [],
})

const deps = (): ScheduledSubjectsDeps => ({
  bridge: fakeDeps(world, forwarded),
  academic: academic(),
  templates: fakeTemplateStore(templates),
  scheduled: {
    careerParallels: async (id) => (id === CAREER ? parallels : []),
    parallelsWithSyllabus: async (ids) => marks.syllabus.filter((id) => ids.includes(id)),
    parallelsWithTeacher: async (ids) => marks.teacher.filter((id) => ids.includes(id)),
    parallelsWithSentSyllabus: async (ids) => marks.sent.filter((id) => ids.includes(id)),
    parallelsWithStartedSyllabus: async (ids) => marks.started.filter((id) => ids.includes(id)),
    careerSubjects: async (id) => (id === CAREER ? subjects : []),
  },
})

const get = () => scheduledSubjects(apiRequest("/api/v1/coordination/academic/scheduled-subjects", { cookie }), deps())

async function read(response: Response): Promise<{ status: number; text: string }> {
  return { status: response.status, text: await response.text() }
}

function asRole(role: string, careerId: string | null = CAREER) {
  world.assignments = [makeAssignment({ role, careerId, careerLabel: careerId === null ? null : "Software" })]
}

beforeEach(() => {
  world = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW - 60 }]]),
    users: [makeUser()],
    assignments: [],
  }
  asRole("coordinador")
  forwarded = []
  careers = new Map([[CAREER, { id: CAREER, name: "Software", modality: "Presencial", cycleCount: 4 }]])
  lock = null
  parallels = []
  subjects = []
  marks = { syllabus: [], teacher: [], sent: [], started: [] }
  templates = { template: goldenTemplate(), values: [] }
})

describe("GET /api/v1/coordination/academic/scheduled-subjects", () => {
  it("lists the career subjects with their parallels, flags and profile progress, byte for byte", async () => {
    lock = { period: "2026-1", institutionalPause: true, deliveryOn: "2026-08-14" }
    parallels = [
      { id: "p-a", subjectId: ALGORITHMS, code: "A", shift: "matutina" },
      { id: "p-b", subjectId: ALGORITHMS, code: "B", shift: "nocturna" },
      { id: "p-r", subjectId: RETIRED_WITH_PARALLEL, code: "C", shift: "vespertina" },
    ]
    marks = { syllabus: ["p-a"], teacher: ["p-b"], sent: ["p-a"], started: ["p-a", "p-r"] }
    subjects = [
      subject({}),
      subject({ id: RETIRED, code: "SW-B1-002", name: "Retirada", active: false }),
      subject({ id: RETIRED_WITH_PARALLEL, code: "SW-B1-003", name: "Retirada con paralelo", active: false, cycle: null, campus: null, modality: null, generatesSyllabus: false }),
      subject({ id: NETWORKS, code: "SW-B2-004", name: "Redes", cycle: 2 }),
    ]
    const respuestas = goldenFields.findIndex((field) => field.key === "respuestas")
    templates.values = [{ fieldId: fieldId(respuestas), subjectId: NETWORKS, value: goldenFields[respuestas].stored }]

    const response = await read(await get())

    expect(response.status).toBe(200)
    expect(response.text).toBe(
      `{"career":{"id":"${CAREER}","name":"Software","lock_reason":"Convocatoria activa","lock":{"scope":"convocation","period":"2026-1","institutional_pause":true,"delivery_on":"2026-08-14"}},` +
        `"scheduledSubjects":[` +
        `{"subject_id":"${ALGORITHMS}","label":"SW-B1-001 \\u00b7 Algoritmos","subject_code":"SW-B1-001","subject_name":"Algoritmos","subject_cycle":1,"profile_complete":false,"generates_syllabus":true,"campus_name":"Campus Laguacoto","modality_name":"Presencial","parallels":[` +
        `{"id":"p-a","code":"A","shift":"matutina","editable":true,"deletable":false,"sent_syllabus":true,"started_syllabus":true},` +
        `{"id":"p-b","code":"B","shift":"nocturna","editable":true,"deletable":false,"sent_syllabus":false,"started_syllabus":false}],"editable":true},` +
        `{"subject_id":"${RETIRED_WITH_PARALLEL}","label":"SW-B1-003 \\u00b7 Retirada con paralelo","subject_code":"SW-B1-003","subject_name":"Retirada con paralelo","subject_cycle":null,"profile_complete":false,"generates_syllabus":false,"campus_name":null,"modality_name":null,"parallels":[` +
        `{"id":"p-r","code":"C","shift":"vespertina","editable":true,"deletable":true,"sent_syllabus":false,"started_syllabus":true}],"editable":true},` +
        `{"subject_id":"${NETWORKS}","label":"SW-B2-004 \\u00b7 Redes","subject_code":"SW-B2-004","subject_name":"Redes","subject_cycle":2,"profile_complete":true,"generates_syllabus":true,"campus_name":"Campus Laguacoto","modality_name":"Presencial","parallels":[],"editable":true}],` +
        `"options":{"faculties":[],"careers":[],"periods":[],"campusOptions":[],"modalityOptions":${MODALITIES},"shiftOptions":${SHIFTS},"currentCurricula":[],` +
        `"activeSubjects":[` +
        `{"id":"${ALGORITHMS}","codigo_asignatura":"SW-B1-001","nombre":"Algoritmos","ciclo":1,"generates_syllabus":true,"profile_complete":false,"profile_filled":12,"profile_total":13},` +
        `{"id":"${NETWORKS}","codigo_asignatura":"SW-B2-004","nombre":"Redes","ciclo":2,"generates_syllabus":true,"profile_complete":true,"profile_filled":13,"profile_total":13}],` +
        `"scheduledSubjects":[],"parallels":[],"teacherUsers":[]}}`,
    )
  })

  it("without a template every profile is complete with nothing to fill", async () => {
    templates.template = null
    subjects = [subject({})]

    const body = JSON.parse((await read(await get())).text)

    expect(body.scheduledSubjects[0].profile_complete).toBe(true)
    expect(body.options.activeSubjects[0]).toMatchObject({ profile_complete: true, profile_filled: 0, profile_total: 0 })
  })

  it("a template whose definition is empty is left to Laravel", async () => {
    templates.template = { ...goldenTemplate(), definition: null }
    subjects = [subject({})]

    expect((await get()).status).toBe(299)
    expect(forwarded).toHaveLength(1)
  })

  it("only the coordinator of an active career may list it", async () => {
    asRole("docente")
    expect(await read(await get())).toEqual({ status: 403, text: FORBIDDEN })
    asRole("administrador", null)
    expect(await read(await get())).toEqual({ status: 403, text: FORBIDDEN })
    asRole("coordinador")
    careers.clear()
    expect(await read(await get())).toEqual({ status: 403, text: FORBIDDEN })
  })

  it("without a session answers 401", async () => {
    const response = await scheduledSubjects(apiRequest("/api/v1/coordination/academic/scheduled-subjects"), deps())
    expect(await read(response)).toEqual({ status: 401, text: '{"message":"Unauthenticated."}' })
  })
})
