// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import {
  curriculumBuilder,
  teacherAssignments,
  type AcademicStructureRepository,
  type CareerLock,
  type CareerRecord,
  type CareerTeacherRecord,
  type MallaRecord,
  type PersonRecord,
  type SubjectRecord,
  type TeacherAssignmentRecord,
} from "./structure"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const CAREER = "01a1c5bc-79ca-7331-8f0f-66d63f61c699"
const OTHER = "01a1c5bc-79ce-710d-bc0a-31ddfa3fcff9"
const MALLA = "01a1c5bc-9000-7000-8000-000000000001"
const OLD_MALLA = "01a1c5bc-9000-7000-8000-000000000002"
const OTHER_MALLA = "01a1c5bc-9000-7000-8000-000000000003"
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'
const SHIFTS = '"shiftOptions":[{"value":"matutina","label":"Matutina"},{"value":"vespertina","label":"Vespertina"},{"value":"nocturna","label":"Nocturna"}]'
const MODALITIES =
  '[{"value":"presencial","label":"Presencial"},{"value":"hibrida","label":"Híbrida"},{"value":"en_linea","label":"En línea"}]'
const BASE_OPTIONS = `"faculties":[],"careers":[],"periods":[],"modalityOptions":${MODALITIES},${SHIFTS},"currentCurricula":[],"activeSubjects":[],"scheduledSubjects":[]`

let world: FakeWorld
let careers: Map<string, CareerRecord>
let mallas: MallaRecord[]
let lock: CareerLock | null
let subjects: SubjectRecord[]
let calls: string[]
let assignments: TeacherAssignmentRecord[]
let teachers: CareerTeacherRecord[]
let pending: PersonRecord[]

function subject(overrides: Partial<SubjectRecord> = {}): SubjectRecord {
  return {
    id: "01a1c5bc-7cbf-7091-860c-63a02b91e998",
    code: "SW-B1-001",
    name: "Algoritmos",
    cycle: 1,
    position: 0,
    organizationUnit: "basica",
    modality: "presencial",
    credits: "3.00",
    totalHours: 144,
    hoursAc: "48.00",
    hoursPae: "48.00",
    hoursAa: "48.00",
    active: true,
    generatesSyllabus: true,
    ...overrides,
  }
}

const repository = (): AcademicStructureRepository => ({
  activeCareer: async (id) => careers.get(id) ?? null,
  careerLock: async () => lock,
  curriculumSubjects: async (id) => (id === MALLA ? subjects : []),
  requirements: async (ids) => {
    calls.push(`requirements:${ids.join(",")}`)
    return ids.length < 2 ? [] : [{ id: "r-1", subjectId: ids[1], requirementId: ids[0] }]
  },
  teacherAssignments: async () => assignments,
  careerTeachers: async () => teachers,
  pendingTeachers: async () => pending,
  unassignedParallels: async () => [{ id: "p-2", label: "Algoritmos · Paralelo B" }],
  teacherUsers: async () => [{ id: "u-1", name: "Ana", email: "ana@silabos.test" }],
})

function deps() {
  return {
    bridge: fakeDeps(world),
    academic: repository(),
    mallas: {
      mallas: async (careerId: string) => mallas.filter((malla) => malla.careerId === careerId),
      malla: async (careerId: string, id: string) => mallas.find((malla) => malla.careerId === careerId && malla.id === id) ?? null,
    },
  }
}

const malla = (id: string, careerId: string, code: string, state: string, cycleCount: number): MallaRecord => ({ id, careerId, code, cycleCount, state, subjectCount: 0 })

function get(path: string): Request {
  return apiRequest(path, { cookie })
}

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
  mallas = [malla(MALLA, CAREER, "SW", "vigente", 4), malla(OLD_MALLA, CAREER, "SW-8", "cerrada", 9), malla(OTHER_MALLA, OTHER, "RED", "vigente", 8)]
  lock = null
  subjects = [subject()]
  calls = []
  assignments = []
  teachers = []
  pending = []
})

describe("GET /api/v1/coordination/academic/curriculum/{curriculum}", () => {
  const path = `/api/v1/coordination/academic/curriculum/${MALLA}`

  it("returns the SPA curriculum contract of the coordinator's career, byte for byte", async () => {
    subjects = [
      subject(),
      subject({
        id: "01a1c5bc-7d0a-7172-b554-6ae09a4da972",
        code: "SW-TEST-2",
        name: "Segunda materia",
        position: 1,
        organizationUnit: null,
        modality: null,
        credits: null,
        totalHours: 0,
        hoursAc: null,
        hoursPae: "1.50",
        hoursAa: null,
      }),
    ]
    const response = await curriculumBuilder(get(path), MALLA, deps())
    const fixed =
      '"fixedFields":[{"id":"horas_ac","key":"acd","label":"ACD","type":"entero","system_key":"horas_ac","system_label":"Horas AC / ACD","position":1,"visible_on_card":true,"totalizable":true},' +
      '{"id":"horas_pae","key":"ape","label":"APE","type":"entero","system_key":"horas_pae","system_label":"Horas PAE / APE","position":2,"visible_on_card":true,"totalizable":true},' +
      '{"id":"horas_aa","key":"aa","label":"AA","type":"entero","system_key":"horas_aa","system_label":"Horas AA","position":3,"visible_on_card":true,"totalizable":true},' +
      '{"id":"creditos","key":"cred","label":"CRED","type":"numero","system_key":"creditos","system_label":"Créditos","position":4,"visible_on_card":true,"totalizable":true},' +
      '{"id":"horas_totales","key":"total","label":"TOTAL","type":"entero","system_key":"horas_totales","system_label":"Horas totales","position":5,"visible_on_card":true,"totalizable":true}]'
    const totals =
      '"fixedFieldTotals":[{"id":"horas_ac","label":"ACD","value":48},{"id":"horas_pae","label":"APE","value":49.5},{"id":"horas_aa","label":"AA","value":48},' +
      '{"id":"creditos","label":"CRED","value":3},{"id":"horas_totales","label":"TOTAL","value":144}]'
    const first =
      '{"id":"01a1c5bc-7cbf-7091-860c-63a02b91e998","code":"SW-B1-001","name":"Algoritmos","cycle":1,"position":0,"organization_unit":"basica","organization_unit_label":"Unidad básica",' +
      '"modality":"presencial","modality_label":"Presencial","credits":"3.00","total_hours":144,"active":true,"generates_syllabus":true,' +
      '"system_values":{"horas_ac":"48.00","horas_pae":"48.00","horas_aa":"48.00","creditos":"3.00","horas_totales":144},' +
      '"display_fields":[{"id":"horas_ac","label":"ACD","value":"48.00"},{"id":"horas_pae","label":"APE","value":"48.00"},{"id":"horas_aa","label":"AA","value":"48.00"},{"id":"creditos","label":"CRED","value":"3.00"},{"id":"horas_totales","label":"TOTAL","value":144}]}'
    const second =
      '{"id":"01a1c5bc-7d0a-7172-b554-6ae09a4da972","code":"SW-TEST-2","name":"Segunda materia","cycle":1,"position":1,"organization_unit":null,"organization_unit_label":null,' +
      '"modality":null,"modality_label":null,"credits":null,"total_hours":0,"active":true,"generates_syllabus":true,' +
      '"system_values":{"horas_ac":null,"horas_pae":"1.50","horas_aa":null,"creditos":null,"horas_totales":0},' +
      '"display_fields":[{"id":"horas_ac","label":"ACD","value":null},{"id":"horas_pae","label":"APE","value":"1.50"},{"id":"horas_aa","label":"AA","value":null},{"id":"creditos","label":"CRED","value":null},{"id":"horas_totales","label":"TOTAL","value":0}]}'
    expect(await read(response)).toEqual({
      status: 200,
      text:
        `{"career":{"id":"${CAREER}","name":"Software","modality":{"value":"presencial","label":"Presencial"}},` +
        `"malla":{"id":"${MALLA}","code":"SW","state":"vigente"},` +
        `"curriculum":{"id":"${MALLA}","cycle_count":4,"editable":true,"lock_reason":null,"lock":null},` +
        `${fixed},${totals},"subjects":[${first},${second}],` +
        `"requirements":[{"id":"r-1","subject_id":"01a1c5bc-7d0a-7172-b554-6ae09a4da972","requirement_id":"01a1c5bc-7cbf-7091-860c-63a02b91e998"}],` +
        `"modalityOptions":${MODALITIES},` +
        '"organizationUnitOptions":[{"value":"basica","label":"Unidad básica"},{"value":"profesional","label":"Unidad profesional"},{"value":"integracion_curricular","label":"Unidad de integración curricular"}],' +
        `"options":{${BASE_OPTIONS},"parallels":[],"teacherUsers":[]}}`,
    })
    expect(calls).toEqual(["requirements:01a1c5bc-7cbf-7091-860c-63a02b91e998,01a1c5bc-7d0a-7172-b554-6ae09a4da972"])
    expect(response.headers.get("content-type")).toBe("application/json")
    expect(world.sessions.get(SESSION_ID)?.lastActivity).toBe(NOW)
  })

  it("marks a career with an open convocation as locked and totals an empty curriculum with integers", async () => {
    lock = { period: "Noviembre-Marzo 2026-2027", institutionalPause: true, deliveryOn: "2026-12-10" }
    subjects = []
    careers.set(CAREER, { id: CAREER, name: "Software", modality: null, cycleCount: 4 })
    const text = await (await curriculumBuilder(get(`/api/v1/coordination/academic/curriculum/${OLD_MALLA}`), OLD_MALLA, deps())).text()
    expect(text).toContain(
      `"career":{"id":"${CAREER}","name":"Software","modality":null},"malla":{"id":"${OLD_MALLA}","code":"SW-8","state":"cerrada"},"curriculum":{"id":"${OLD_MALLA}","cycle_count":9,"editable":false,"lock_reason":"Periodo académico activo",` +
        '"lock":{"scope":"convocation","period":"Noviembre-Marzo 2026-2027","institutional_pause":true,"delivery_on":"2026-12-10"}}',
    )
    expect(text).toContain(
      '"fixedFieldTotals":[{"id":"horas_ac","label":"ACD","value":0},{"id":"horas_pae","label":"APE","value":0},{"id":"horas_aa","label":"AA","value":0},{"id":"creditos","label":"CRED","value":0},{"id":"horas_totales","label":"TOTAL","value":0}],"subjects":[],"requirements":[]',
    )
  })

  it.each([
    ["administrador", null],
    ["docente", CAREER],
    ["bibliotecario", null],
  ])("answers 403 to the %s role", async (role, careerId) => {
    asRole(role, careerId)
    expect(await read(await curriculumBuilder(get(path), MALLA, deps()))).toEqual({ status: 403, text: FORBIDDEN })
  })

  it("answers 403 when the coordinator's career is inactive", async () => {
    careers.clear()
    expect(await read(await curriculumBuilder(get(path), MALLA, deps()))).toEqual({ status: 403, text: FORBIDDEN })
  })

  it("aborts a malla of another career, and the career id itself, with 404 and answers the router 404 for a non-UUID path", async () => {
    expect(await read(await curriculumBuilder(get(`/api/v1/coordination/academic/curriculum/${OTHER_MALLA}`), OTHER_MALLA, deps()))).toEqual({ status: 404, text: '{"message":""}' })
    expect(await read(await curriculumBuilder(get(`/api/v1/coordination/academic/curriculum/${CAREER}`), CAREER, deps()))).toEqual({ status: 404, text: '{"message":""}' })
    expect(await read(await curriculumBuilder(get("/api/v1/coordination/academic/curriculum/abc"), "abc", deps()))).toEqual({ status: 404, text: '{"message":"The route api/v1/coordination/academic/curriculum/abc could not be found."}' })
  })

  it("answers 401 without a session and 409 when the stale session role leaves no single eligible role", async () => {
    expect(await read(await curriculumBuilder(apiRequest(path), CAREER, deps()))).toEqual({ status: 401, text: '{"message":"Unauthenticated."}' })
    world.assignments = [makeAssignment({ role: "coordinador" }), makeAssignment({ id: "other-role", role: "docente" })]
    world.sessions.set(SESSION_ID, { payload: sessionPayload(loggedInAttributes({ active_role_assignment_id: "missing" })), lastActivity: NOW - 60 })
    const response = await read(await curriculumBuilder(get(path), MALLA, deps()))
    expect(response.status).toBe(409)
    expect(response.text).toContain("Seleccione un rol vigente.")
  })
})

describe("GET /api/v1/coordination/academic/teacher-assignments", () => {
  const path = "/api/v1/coordination/academic/teacher-assignments"

  it("lists assignments, every active career teacher sorted by name with invitation state, and the options", async () => {
    assignments = [
      {
        id: "a-1",
        userId: "u-1",
        userName: "Ana",
        userEmail: "ana@silabos.test",
        parallelId: "p-1",
        parallelCode: "A",
        subjectName: "Algoritmos",
        active: true,
      },
    ]
    teachers = [
      { id: "u-3", name: "Nuevo docente", email: "nuevo@silabos.test", verified: false, hasActiveInvitation: true, active: true },
      { id: "u-2", name: "Docente sin paralelo", email: "sin.paralelo@silabos.test", verified: true, hasActiveInvitation: false, active: true },
      { id: "u-4", name: "Vencido", email: "vencido@silabos.test", verified: false, hasActiveInvitation: false, active: false },
      { id: "u-2", name: "Docente sin paralelo", email: "sin.paralelo@silabos.test", verified: true, hasActiveInvitation: false, active: true },
    ]
    pending = [
      { id: "u-3", name: "Nuevo docente", email: "nuevo@silabos.test" },
      { id: "u-3", name: "Nuevo docente", email: "nuevo@silabos.test" },
    ]
    lock = { period: "2026-2027", institutionalPause: false, deliveryOn: "2026-12-10" }
    expect(await read(await teacherAssignments(get(path), deps()))).toEqual({
      status: 200,
      text:
        `{"career":{"id":"${CAREER}","name":"Software","lock_reason":"Periodo académico activo","lock":{"scope":"convocation","period":"2026-2027","institutional_pause":false,"delivery_on":"2026-12-10"}},` +
        '"teacherAssignments":[{"id":"a-1","user_id":"u-1","parallel_id":"p-1","user_name":"Ana","user_email":"ana@silabos.test","parallel_code":"A","subject_name":"Algoritmos","active":true,"editable":true}],' +
        '"careerTeachers":[{"id":"u-2","name":"Docente sin paralelo","email":"sin.paralelo@silabos.test","pending_activation":false,"invitation_expired":false,"active":true},' +
        '{"id":"u-3","name":"Nuevo docente","email":"nuevo@silabos.test","pending_activation":true,"invitation_expired":false,"active":true},' +
        '{"id":"u-4","name":"Vencido","email":"vencido@silabos.test","pending_activation":true,"invitation_expired":true,"active":false}],' +
        '"pendingTeachers":[{"id":"u-3","name":"Nuevo docente","email":"nuevo@silabos.test"}],' +
        `"options":{${BASE_OPTIONS},"parallels":[{"id":"p-2","label":"Algoritmos · Paralelo B"}],"teacherUsers":[{"id":"u-1","name":"Ana","email":"ana@silabos.test"}]},` +
        '"canCreateTeacher":true}',
    })
  })

  it("keeps the database order for equal names and sorts by bytes like PHP", async () => {
    teachers = [
      { id: "u-b", name: "beta", email: "b@x", verified: true, hasActiveInvitation: false, active: true },
      { id: "u-z", name: "Zeta", email: "z1@x", verified: true, hasActiveInvitation: false, active: true },
      { id: "u-a", name: "Álvaro", email: "a@x", verified: true, hasActiveInvitation: false, active: true },
      { id: "u-y", name: "Zeta", email: "z2@x", verified: true, hasActiveInvitation: false, active: true },
    ]
    const body = JSON.parse(await (await teacherAssignments(get(path), deps())).text()) as { careerTeachers: { id: string }[] }
    expect(body.careerTeachers.map((teacher) => teacher.id)).toEqual(["u-z", "u-y", "u-b", "u-a"])
  })

  it("answers 403 outside an active career coordination", async () => {
    asRole("docente")
    expect(await read(await teacherAssignments(get(path), deps()))).toEqual({ status: 403, text: FORBIDDEN })
    asRole("coordinador")
    careers.clear()
    expect(await read(await teacherAssignments(get(path), deps()))).toEqual({ status: 403, text: FORBIDDEN })
  })
})

describe("reads through /api/v1/admin/careers/{career}/academic", () => {
  beforeEach(() => {
    careers.set(OTHER, { id: OTHER, name: "Redes", modality: "presencial", cycleCount: 8 })
  })

  it("gives the administrator the curriculum and teacher assignments of the requested career", async () => {
    asRole("administrador", null)
    const curriculum = await curriculumBuilder(get(`/api/v1/admin/careers/${OTHER}/academic/curriculum/${OTHER_MALLA}`), OTHER_MALLA, deps(), OTHER)
    expect(curriculum.status).toBe(200)
    expect(((await curriculum.json()) as { career: { id: string; name: string } }).career).toMatchObject({ id: OTHER, name: "Redes" })
    const staff = await teacherAssignments(get(`/api/v1/admin/careers/${OTHER}/academic/teacher-assignments`), deps(), OTHER)
    expect(((await staff.json()) as { career: { id: string } }).career.id).toBe(OTHER)
  })

  it("answers 404 for a malla that is not of the requested career and for an unknown career", async () => {
    asRole("administrador", null)
    expect((await curriculumBuilder(get(`/api/v1/admin/careers/${OTHER}/academic/curriculum/${MALLA}`), MALLA, deps(), OTHER)).status).toBe(404)
    const unknown = "01a1c5bc-79cf-7000-8000-000000000009"
    expect((await teacherAssignments(get(`/api/v1/admin/careers/${unknown}/academic/teacher-assignments`), deps(), unknown)).status).toBe(404)
  })

  it("refuses a coordinator who requests another career", async () => {
    expect(await read(await curriculumBuilder(get(`/api/v1/admin/careers/${OTHER}/academic/curriculum/${OTHER_MALLA}`), OTHER_MALLA, deps(), OTHER))).toEqual({ status: 403, text: FORBIDDEN })
    expect(await read(await teacherAssignments(get(`/api/v1/admin/careers/${OTHER}/academic/teacher-assignments`), deps(), OTHER))).toEqual({ status: 403, text: FORBIDDEN })
  })
})
