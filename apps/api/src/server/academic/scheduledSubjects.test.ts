// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, makeAssignment, loggedInAttributes, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { fakeTemplateStore, fieldId, goldenFields, goldenTemplate, type FakeTemplateWorld } from "../configuration/testing"
import type { AcademicStructureRepository, CareerLock, CareerRecord } from "./structure"
import { Prisma } from "../../generated/prisma/client"
import type { PrismaService } from "../../prisma/prisma.service"
import { ScheduledSubjectsPrismaRepository } from "../../modules/academic/repositories/scheduled-subjects.repository"
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
  '[{"value":"presencial","label":"Presencial"},{"value":"hibrida","label":"Híbrida"},{"value":"en_linea","label":"En línea"}]'
const SHIFTS = '[{"value":"matutina","label":"Matutina"},{"value":"vespertina","label":"Vespertina"},{"value":"nocturna","label":"Nocturna"}]'

let world: FakeWorld
let careers: Map<string, CareerRecord>
let lock: CareerLock | null
let profileEditable: boolean
let parallels: CareerParallelRecord[]
let subjects: ScheduledSubjectRecord[]
let marks: { syllabus: string[]; teacher: string[]; sent: string[]; started: string[] }
let templates: FakeTemplateWorld

function subject(overrides: Partial<ScheduledSubjectRecord>): ScheduledSubjectRecord {
  return { id: ALGORITHMS, code: "SW-B1-001", name: "Algoritmos", cycle: 1, active: true, generatesSyllabus: true, modality: "presencial", mallaName: "Malla SW-9", mallaCode: "SW-9", ...overrides }
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
  bridge: fakeDeps(world),
  academic: academic(),
  templates: fakeTemplateStore(templates),
  careerProfileEditable: async () => profileEditable,
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
  careers = new Map([[CAREER, { id: CAREER, name: "Software", modality: "presencial", cycleCount: 4 }]])
  lock = null
  profileEditable = true
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
      subject({ id: RETIRED_WITH_PARALLEL, code: "SW-B1-003", name: "Retirada con paralelo", active: false, cycle: null, modality: null, generatesSyllabus: false }),
      subject({ id: NETWORKS, code: "SW-B2-004", name: "Redes", cycle: 2, mallaName: "Malla SW-8", mallaCode: "SW-8" }),
    ]
    const respuestas = goldenFields.findIndex((field) => field.key === "respuestas")
    templates.values = [{ fieldId: fieldId(respuestas), subjectId: NETWORKS, value: goldenFields[respuestas].stored }]

    const response = await read(await get())

    expect(response.status).toBe(200)
    expect(response.text).toBe(
      `{"career":{"id":"${CAREER}","name":"Software","lock_reason":"Periodo académico activo","lock":{"scope":"convocation","period":"2026-1","institutional_pause":true,"delivery_on":"2026-08-14"},"profile_lock_reason":null},` +
        `"scheduledSubjects":[` +
        `{"subject_id":"${ALGORITHMS}","label":"SW-B1-001 · Algoritmos","subject_code":"SW-B1-001","subject_name":"Algoritmos","subject_cycle":1,"profile_complete":false,"generates_syllabus":true,"modality_name":"Presencial","malla_name":"Malla SW-9","parallels":[` +
        `{"id":"p-a","code":"A","shift":"matutina","editable":true,"deletable":false,"sent_syllabus":true,"started_syllabus":true},` +
        `{"id":"p-b","code":"B","shift":"nocturna","editable":true,"deletable":true,"sent_syllabus":false,"started_syllabus":false}],"editable":true},` +
        `{"subject_id":"${RETIRED_WITH_PARALLEL}","label":"SW-B1-003 · Retirada con paralelo","subject_code":"SW-B1-003","subject_name":"Retirada con paralelo","subject_cycle":null,"profile_complete":false,"generates_syllabus":false,"modality_name":null,"malla_name":"Malla SW-9","parallels":[` +
        `{"id":"p-r","code":"C","shift":"vespertina","editable":true,"deletable":true,"sent_syllabus":false,"started_syllabus":true}],"editable":true},` +
        `{"subject_id":"${NETWORKS}","label":"SW-B2-004 · Redes","subject_code":"SW-B2-004","subject_name":"Redes","subject_cycle":2,"profile_complete":false,"generates_syllabus":true,"modality_name":"Presencial","malla_name":"Malla SW-8","parallels":[],"editable":true}],` +
        `"options":{"faculties":[],"careers":[],"periods":[],"modalityOptions":${MODALITIES},"shiftOptions":${SHIFTS},"currentCurricula":[],` +
        `"activeSubjects":[` +
        `{"id":"${ALGORITHMS}","codigo_asignatura":"SW-B1-001","nombre":"Algoritmos","ciclo":1,"malla_name":"Malla SW-9","malla_code":"SW-9","generates_syllabus":true,"profile_complete":false,"profile_filled":0,"profile_total":13},` +
        `{"id":"${NETWORKS}","codigo_asignatura":"SW-B2-004","nombre":"Redes","ciclo":2,"malla_name":"Malla SW-8","malla_code":"SW-8","generates_syllabus":true,"profile_complete":false,"profile_filled":1,"profile_total":13}],` +
        `"scheduledSubjects":[],"parallels":[],"teacherUsers":[]}}`,
    )
  })

  it("tells coordination why the career project is read-only when the period is paused or finalized, and tells the administrator nothing", async () => {
    const reason = async () => ((await (await get()).json()) as { career: { profile_lock_reason: string | null } }).career.profile_lock_reason
    expect(await reason()).toBeNull()
    profileEditable = false
    expect(await reason()).toBe("El proyecto de carrera no se puede editar con el periodo académico en pausa o finalizado.")
    asRole("administrador", null)
    const admin = await scheduledSubjects(apiRequest(`/api/v1/admin/careers/${CAREER}/academic/scheduled-subjects`, { cookie }), deps(), CAREER)
    expect(((await admin.json()) as { career: { profile_lock_reason: string | null } }).career.profile_lock_reason).toBeNull()
  })

  it("without a template every profile is complete with nothing to fill", async () => {
    templates.template = null
    subjects = [subject({})]

    const body = JSON.parse((await read(await get())).text)

    expect(body.scheduledSubjects[0].profile_complete).toBe(true)
    expect(body.options.activeSubjects[0]).toMatchObject({ profile_complete: true, profile_filled: 0, profile_total: 0 })
  })

  it("lists the subjects without template progress when the institution has no template", async () => {
    templates.template = null
    subjects = [subject({})]

    expect((await get()).status).toBe(200)
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

describe("GET /api/v1/admin/careers/{career}/academic/scheduled-subjects", () => {
  const OTHER = "01a1c5bc-79ce-710d-bc0a-31ddfa3fcff9"
  const read = (careerId: string) => scheduledSubjects(apiRequest(`/api/v1/admin/careers/${careerId}/academic/scheduled-subjects`, { cookie }), deps(), careerId)

  beforeEach(() => {
    careers.set(OTHER, { id: OTHER, name: "Redes", modality: "presencial", cycleCount: 8 })
  })

  it("lists the requested career for the administrator", async () => {
    asRole("administrador", null)
    const response = await read(OTHER)
    expect(response.status).toBe(200)
    expect(((await response.json()) as { career: { id: string; name: string } }).career).toMatchObject({ id: OTHER, name: "Redes" })
  })

  it("refuses a coordinator who requests another career", async () => {
    const response = await read(OTHER)
    expect({ status: response.status, text: await response.text() }).toEqual({ status: 403, text: FORBIDDEN })
  })
})

describe("scheduled subjects across mallas", () => {
  function repository(rows: unknown[]) {
    const queries: string[] = []
    const prisma = {
      $queryRaw: async (raw: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
        queries.push((raw instanceof Prisma.Sql ? raw : Prisma.sql(raw, ...values)).text.replace(/\s+/g, " ").trim())
        return rows
      },
    } as unknown as PrismaService
    return { repository: new ScheduledSubjectsPrismaRepository(prisma), queries }
  }

  it("lists the subjects of every malla that is not closed, labelled «Malla <código>» and ordered by malla code", async () => {
    const { repository: found, queries } = repository([
      { id: ALGORITHMS, codigo: "SW-B1-001", nombre: "Algoritmos", ciclo: 1, activo: true, genera: true, modalidad: "presencial", malla: "Malla SW-8" },
    ])
    expect(await found.careerSubjects(CAREER)).toEqual([
      { id: ALGORITHMS, code: "SW-B1-001", name: "Algoritmos", cycle: 1, active: true, generatesSyllabus: true, modality: "presencial", mallaName: "Malla SW-8" },
    ])
    expect(queries[0]).toContain("inner join mallas malla on malla.malla_id = asignatura.malla_id")
    expect(queries[0]).toContain("malla.estado_malla <> 'cerrada'")
    expect(queries[0]).toContain("('Malla ' || malla.codigo_malla) as malla")
    expect(queries[0]).toContain("order by (malla.estado_malla = 'vigente') desc, malla.codigo_malla asc, asignatura.ciclo_asignatura asc")
    expect(queries[0]).not.toContain("nombre_malla")
  })

  it("only lists the parallels of subjects whose malla is not closed", async () => {
    const { repository: found, queries } = repository([])
    await found.careerParallels(CAREER)
    expect(queries[0]).toMatch(/exists \(select 1 from mallas malla_abierta where malla_abierta\.malla_id = asignaturas\.malla_id and malla_abierta\.estado_malla <> 'cerrada'\)/)
  })

  it("sends malla_name for each subject and keeps listing a career with a single malla", async () => {
    subjects = [subject({}), subject({ id: NETWORKS, code: "SW-B2-004", name: "Redes", cycle: 2, mallaName: "Malla SW-8" })]
    const body = JSON.parse((await read(await get())).text) as { scheduledSubjects: { subject_id: string; malla_name: string | null }[] }
    expect(body.scheduledSubjects.map((row) => [row.subject_id, row.malla_name])).toEqual([[ALGORITHMS, "Malla SW-9"], [NETWORKS, "Malla SW-8"]])
    subjects = [subject({ mallaName: undefined })]
    const single = JSON.parse((await read(await get())).text) as { scheduledSubjects: { malla_name: string | null }[] }
    expect(single.scheduledSubjects).toHaveLength(1)
    expect(single.scheduledSubjects[0].malla_name).toBeNull()
  })
})
