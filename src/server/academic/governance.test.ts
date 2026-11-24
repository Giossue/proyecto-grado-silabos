// @vitest-environment node
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { academicGovernance, type CareerRoleCount, type GovernanceCareer, type GovernanceFaculty, type GovernancePeriod, type GovernanceProcess } from "./governance"

const SESSION_ID = golden.sessionId
const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(SESSION_ID))}`
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'
const FACULTY = "01a1c5bc-798f-72af-b64b-3cd174a1687b"
const OTHER_FACULTY = "01a1c5bc-798f-72af-b64b-000000000002"
const CAREER = "01a1c5bc-79ca-7331-8f0f-66d63f61c699"
const IDLE_CAREER = "01a1c5bc-79ca-7331-8f0f-000000000003"
const PERIOD = "01a1c5bc-79d3-730d-84f4-6a91c41c8a75"
const OLD_PERIOD = "01a1c5bc-79d3-730d-84f4-000000000004"
const PROCESS = "01a1c5bc-8107-70ce-b951-112443c38cd1"
const MATRIZ = "Campus Matriz Dr. Gabriel Galarza López"

let root: string
let world: FakeWorld
let forwarded: Request[]
let processes: GovernanceProcess[]
let faculties: GovernanceFaculty[]
let careers: GovernanceCareer[]
let periods: GovernancePeriod[]
let running: string[]
let roleCounts: CareerRoleCount[]
let today: string

const deps = () => ({
  bridge: fakeDeps(world, forwarded),
  today: () => today,
  governance: {
    processes: async () => processes,
    faculties: async () => faculties,
    careers: async () => careers,
    periods: async () => periods,
    facultiesWithActiveCareers: async (ids: string[]) => [...new Set(careers.filter((career) => career.active && ids.includes(career.facultyId)).map((career) => career.facultyId))],
    careersInRunningConvocation: async (ids: string[]) => running.filter((id) => ids.includes(id)),
    careerRoleCounts: async (ids: string[]) => roleCounts.filter((row) => ids.includes(row.careerId)),
  },
})

const list = (section: string | null = null) =>
  academicGovernance(apiRequest(`/api/v1/admin/academic${section === null ? "" : `/${section}`}`, { cookie, headers: { host: "localhost:3000" } }), section, deps())

type Row = Record<string, unknown>
type GovernanceBody = {
  lock_reason: string | null
  convocation_in_progress: boolean
  catalogs: { faculties: Row[]; careers: Row[]; periods: Row[] }
  options: Row
  section: string
}

async function json(section: string | null = null): Promise<GovernanceBody> {
  const response = await list(section)
  expect(response.status).toBe(200)
  return JSON.parse(await response.text())
}

function asRole(role: string, careerId: string | null = null) {
  world.assignments = [makeAssignment({ role, careerId })]
}

const career = (overrides: Partial<GovernanceCareer> = {}): GovernanceCareer => ({
  id: CAREER,
  facultyId: FACULTY,
  coordinator: { id: "01a1c5bc-7a86-7353-917c-f4f6dda1739c", name: "MARÍA JOSÉ" },
  modality: "Presencial",
  campus: MATRIZ,
  code: "SW-8",
  name: "Software",
  active: true,
  ...overrides,
})

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "silabos-governance-"))
  process.env.LARAVEL_STORAGE_PATH = path.join(root, "storage", "app")
  process.env.LARAVEL_PUBLIC_PATH = path.join(root, "public")
  const logo = path.join(root, "storage", "app", "private", "logos", "facultades", FACULTY, "logo.png")
  await mkdir(path.dirname(logo), { recursive: true })
  await writeFile(logo, "logo")
  await utimes(logo, 1794318825, 1794318825)
})

afterAll(async () => {
  delete process.env.LARAVEL_STORAGE_PATH
  delete process.env.LARAVEL_PUBLIC_PATH
  await rm(root, { recursive: true, force: true })
})

beforeEach(() => {
  world = {
    sessions: new Map([[SESSION_ID, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW - 60 }]]),
    users: [makeUser()],
    assignments: [],
  }
  asRole("administrador")
  forwarded = []
  today = "2026-11-23"
  processes = [{ id: PROCESS, periodId: PERIOD, state: "abierto" }]
  faculties = [
    { id: FACULTY, name: "Ciencias Administrativas", campus: MATRIZ, libraries: ["BIB-1"], active: true, logo: { disk: "private", path: `logos/facultades/${FACULTY}/logo.png`, classification: "logo_facultad" } },
    { id: OTHER_FACULTY, name: "Ciencias Agropecuarias", campus: "Campus Laguacoto", libraries: [], active: true, logo: null },
  ]
  careers = [career(), career({ id: IDLE_CAREER, facultyId: OTHER_FACULTY, coordinator: null, modality: null, campus: "Campus Laguacoto", code: "AG-1", name: "Agronomía", active: false })]
  periods = [
    { id: PERIOD, code: "Noviembre-Marzo 2026-2027", startsOn: "2026-11-02", endsOn: "2027-03-12", teachingWeeks: 16 },
    { id: OLD_PERIOD, code: "Mayo-Septiembre 2026", startsOn: "2026-05-04", endsOn: "2026-09-11", teachingWeeks: null },
  ]
  running = [CAREER]
  roleCounts = [
    { careerId: CAREER, role: "docente", total: 3 },
    { careerId: CAREER, role: "coordinador", total: 1 },
  ]
})

describe("GET admin/academic/{section?}", () => {
  it("gives the academic forms the authoritative modality, shift and campus options", async () => {
    const body = await json()
    expect(body.options).toEqual({
      faculties: [
        { id: FACULTY, nombre: "Ciencias Administrativas" },
        { id: OTHER_FACULTY, nombre: "Ciencias Agropecuarias" },
      ],
      careers: [],
      periods: [],
      campusOptions: [
        { value: MATRIZ, label: MATRIZ },
        { value: "Campus Laguacoto", label: "Campus Laguacoto" },
        { value: "Campus CENI (Centro de Eventos Nacionales e Internacionales)", label: "Campus CENI (Centro de Eventos Nacionales e Internacionales)" },
        { value: "Extensión San Miguel", label: "Extensión San Miguel" },
        { value: "Sede Chimbo", label: "Sede Chimbo" },
      ],
      modalityOptions: ["Presencial", "Semipresencial", "En línea", "A distancia", "Híbrida"].map((value) => ({ value, label: value })),
      shiftOptions: [
        { value: "matutina", label: "Matutina" },
        { value: "vespertina", label: "Vespertina" },
        { value: "nocturna", label: "Nocturna" },
      ],
      currentCurricula: [],
      activeSubjects: [],
      scheduledSubjects: [],
      parallels: [],
      teacherUsers: [],
    })
  })

  it("serializes the catalogs in Laravel's order and shape", async () => {
    const response = await list()
    const text = await response.text()
    expect(text.startsWith('{"lock_reason":"Convocatoria activa","convocation_in_progress":true,"catalogs":{"faculties":[{"id":"')).toBe(true)
    expect(text).toContain(
      `{"id":"${FACULTY}","nombre":"Ciencias Administrativas","campus":"${MATRIZ.replace("ó", "\\u00f3")}","catalog_libraries":["BIB-1"],"activo":true,` +
        `"deactivate_block":"Desactive primero las carreras activas de esta facultad.","lock_reason":null,"logo_url":"http:\\/\\/localhost:3000\\/logos\\/facultad\\/${FACULTY}?v=1794318825"}`,
    )
    expect(text.endsWith('"section":"faculties"}')).toBe(true)
    const body = JSON.parse(text)
    expect(body.catalogs.faculties[1]).toMatchObject({ id: OTHER_FACULTY, deactivate_block: null, logo_url: null })
    expect(body.catalogs.careers[0]).toEqual({
      id: CAREER,
      faculty_id: FACULTY,
      coordinator: { id: "01a1c5bc-7a86-7353-917c-f4f6dda1739c", name: "MARÍA JOSÉ" },
      modality: "Presencial",
      modality_label: "Presencial",
      campus_name: MATRIZ,
      code: "SW-8",
      name: "Software",
      active: true,
      deactivate_block: "La carrera participa en una convocatoria en curso. Espere a que se cierre.",
      deactivate_users: { coordinators: 1, teachers: 3 },
      lock_reason: null,
    })
    expect(body.catalogs.careers[1]).toMatchObject({ coordinator: null, modality: null, modality_label: null, deactivate_block: null, deactivate_users: { coordinators: 0, teachers: 0 } })
  })

  it("locks a period with an open process as «Convocatoria activa» and with a closed one as «Convocatoria cerrada»", async () => {
    let body = await json()
    expect(body.catalogs.periods[0]).toEqual({
      id: PERIOD,
      code: "Noviembre-Marzo 2026-2027",
      starts_on: "2026-11-02",
      ends_on: "2027-03-12",
      teaching_weeks: 16,
      status: "en_curso",
      status_label: "En curso",
      institutional_process: { id: PROCESS, state: "abierto" },
      lock_reason: "Convocatoria activa",
    })
    expect(body.catalogs.periods[1]).toMatchObject({ status: "finalizado", status_label: "Finalizado", institutional_process: null, lock_reason: null })

    processes = [{ id: PROCESS, periodId: PERIOD, state: "cerrado" }]
    body = await json()
    expect(body.lock_reason).toBe("Convocatoria cerrada")
    expect(body.convocation_in_progress).toBe(false)
    expect(body.catalogs.periods[0].lock_reason).toBe("Convocatoria cerrada")
  })

  it("keeps a period current on its last day and upcoming before it starts", async () => {
    today = "2027-03-12"
    expect((await json()).catalogs.periods[0].status).toBe("en_curso")
    today = "2026-11-01"
    expect((await json()).catalogs.periods[0]).toMatchObject({ status: "proximo", status_label: "Próximo" })
  })

  it("shows no lock and no warning without processes", async () => {
    processes = []
    running = []
    const body = await json()
    expect(body.lock_reason).toBeNull()
    expect(body.convocation_in_progress).toBe(false)
    expect(body.catalogs.careers[0].deactivate_block).toBeNull()
  })

  it("maps the route section like Laravel and leaves unknown sections to Laravel", async () => {
    expect((await json("carreras")).section).toBe("careers")
    expect((await json("facultades")).section).toBe("faculties")
    expect((await json("periodos-academicos")).section).toBe("academic-periods")
    expect((await list("otra")).status).toBe(299)
    expect(forwarded).toHaveLength(1)
  })

  it("is reserved to the Administrator role", async () => {
    for (const [role, careerId] of [["coordinador", CAREER], ["docente", CAREER], ["bibliotecario", null]] as const) {
      asRole(role, careerId)
      const response = await list("otra")
      expect({ status: response.status, text: await response.text() }).toEqual({ status: 403, text: FORBIDDEN })
    }
  })

  it("answers 401 without a session", async () => {
    const response = await academicGovernance(apiRequest("/api/v1/admin/academic"), null, deps())
    expect({ status: response.status, text: await response.text() }).toEqual({ status: 401, text: '{"message":"Unauthenticated."}' })
  })
})
