// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { dashboardDeadline, dashboardIndex, type ConvocationRecord, type DashboardRepository, type ProcessRecord, type TeacherSyllabus } from "./dashboard"
import type { CareerReadinessFacts, SetupRepository } from "./setupChecklist"
import { fakeTemplateStore, goldenTemplate, writtenCareerFields } from "../configuration/testing"
import type { SyllabusTemplate } from "../configuration/templatePresentation"

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
let calls: string[]
let setup: SetupWorld
let template: SyllabusTemplate | null

type DashboardBody = {
  metrics: unknown[]
  setup: { done: number; steps: Record<string, unknown>[] }
  deadline: unknown
  coordination_convocation: unknown
}

type SetupWorld = {
  activeFaculty: boolean
  activeCareers: number
  withoutCoordinator: number
  roles: string[]
  processExists: boolean
  hasFields: boolean
  counts: { total: number; approved: number; notStarted: number }
  withoutConvocation: number
  readiness: CareerReadinessFacts | null
  activeTeacher: boolean
}

const SUBJECTS = ["30000000-0000-4000-8000-000000000001", "30000000-0000-4000-8000-000000000002"]
const FACULTY = "40000000-0000-4000-8000-000000000001"
const TEMPLATE_HINT = "Secciones y campos con un responsable: Docente, Coordinación o Institucional. El mismo editor permite texto, listas y tablas."

function officialTemplate(): SyllabusTemplate {
  const golden = goldenTemplate()
  return { ...golden, sections: golden.sections.filter((section) => section.key !== "sinteticos") }
}

const setupRepository = (): SetupRepository => ({
  activeFacultyExists: async () => setup.activeFaculty,
  activeCareerCount: async () => setup.activeCareers,
  activeCareersWithoutCoordinator: async () => setup.withoutCoordinator,
  activeUserWithRole: async (role) => setup.roles.includes(role),
  processExists: async () => setup.processExists,
  templateHasFields: async () => setup.hasFields,
  processSyllabusCounts: async (processId) => {
    calls.push(`counts:${processId}`)
    return setup.counts
  },
  careersWithoutConvocation: async () => setup.withoutConvocation,
  careerReadiness: async (careerId) => {
    calls.push(`readiness:${careerId}`)
    return setup.readiness
  },
  careerHasActiveTeacher: async () => setup.activeTeacher,
})

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
    return { pendiente: 3, coordinacion: 1, firmado: 0, devuelto: 2, reemplazado: 1 }
  },
})

function asRole(role: string, careerId: string | null = "c-1") {
  world.assignments = [makeAssignment({ role, careerId })]
}

async function call(handler: typeof dashboardDeadline, path: string, today = "2026-11-23") {
  const response = await handler(apiRequest(path, { cookie }), {
    bridge: fakeDeps(world),
    dashboard: repository(),
    today: () => today,
    setup: setupRepository(),
    // Coordinación has written every Carrera field of the official template.
    templates: fakeTemplateStore({ template, values: writtenCareerFields(officialTemplate(), SUBJECTS) }),
  })
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
  calls = []
  template = officialTemplate()
  setup = {
    activeFaculty: true,
    activeCareers: 2,
    withoutCoordinator: 0,
    roles: ["coordinador", "bibliotecario"],
    processExists: true,
    hasFields: true,
    counts: { total: 13, approved: 1, notStarted: 11 },
    withoutConvocation: 0,
    readiness: {
      subjectsCount: 2,
      faculty: { id: FACULTY, logo: null },
      scheduledSubjectIds: SUBJECTS,
      scheduledWithParallels: 2,
      parallelTotal: 2,
      parallelsWithTeacher: 1,
    },
    activeTeacher: true,
  }
})

describe("dashboard deadline", () => {
  it("shows the teacher the nearest open deadline", async () => {
    teacherSyllabi = [
      { convocation: { id: "late", state: "abierto" }, process: process({ dueOn: "2026-12-10" }), dueAt: 2000 },
      { convocation: { id: CONVOCATION, state: "abierto" }, process: process(), dueAt: 1000 },
    ]
    const response = await call(dashboardDeadline, "/api/v1/dashboard/deadline")
    expect(response.status).toBe(200)
    expect(response.text).toBe(
      '{"deadline":{"period":"2026-2","starts_at":"2026-11-01","due_at":"2026-11-30","state":"active","days_until_start":0,"days_until_due":7,"convocation_id":"20000000-0000-4000-8000-000000000001","paused_by":null,"classes_ended":false,"career_pending":false}}',
    )
    expect(calls[0]).toBe(`teacher:${golden.userId}:c-1`)
  })

  it("names who paused, and tells upcoming and overdue apart", async () => {
    teacherSyllabi = [{ convocation: { id: CONVOCATION, state: "pausado" }, process: process(), dueAt: 1 }]
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline")).json).toEqual({ deadline: deadline({ state: "paused", paused_by: "coordinacion", convocation_id: CONVOCATION }) })
    teacherSyllabi = [{ convocation: { id: CONVOCATION, state: "abierto" }, process: process({ state: "pausado" }), dueAt: 1 }]
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline")).json?.deadline).toMatchObject({ state: "paused", paused_by: "administracion" })
    teacherSyllabi = [{ convocation: { id: CONVOCATION, state: "abierto" }, process: process(), dueAt: 1 }]
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline", "2026-10-20")).json?.deadline).toMatchObject({ state: "upcoming", days_until_start: 12, days_until_due: 41 })
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline", "2027-03-16")).json?.deadline).toMatchObject({ state: "overdue", days_until_due: 0, classes_ended: true })
  })

  it("shows the teacher a pause, then the last finalized process, without syllabi", async () => {
    convocation = { id: CONVOCATION, state: "pausado" }
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline")).json).toEqual({
      deadline: deadline({ state: "paused", paused_by: "coordinacion", convocation_id: CONVOCATION }),
    })
    convocation = { id: CONVOCATION, state: "abierto" }
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline")).json).toEqual({ deadline: null })
    inProgress = null
    latest = process({ state: "cerrado" })
    finalized = { id: CONVOCATION, state: "cerrado" }
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline")).json).toEqual({ deadline: deadline({ state: "closed", convocation_id: CONVOCATION }) })
    finalized = null
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline")).json).toEqual({ deadline: null })
  })

  it("gives Coordination its career convocation and marks it pending until it opens", async () => {
    asRole("coordinador")
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline")).json).toEqual({ deadline: deadline({ career_pending: true }) })
    expect(calls).toContain(`convocation:c-1:${PROCESS}`)
    convocation = { id: CONVOCATION, state: "abierto" }
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
        { key: "library_pending", label: "En revisión", value: 3, suffix: null, hint: "2 por revisar en Biblioteca y 1 en Coordinación" },
        { key: "library_signed", label: "Aprobados", value: 0, suffix: null, hint: "Con la aprobación de Coordinación" },
        { key: "library_commented", label: "Corrección solicitada", value: 2, suffix: null, hint: "Devueltos al docente para que los corrija" },
      ],
      setup: null,
      deadline: deadline(),
      coordination_convocation: null,
    })
    expect(response.text).toContain('"label":"En revisión"')
  })

  it("serves the teacher dashboard without metrics", async () => {
    expect((await call(dashboardIndex, "/api/v1/dashboard")).json).toEqual({ metrics: [], setup: null, deadline: null, coordination_convocation: null })
  })

  it("gives Administration the process metrics and its checklist, without a deadline", async () => {
    asRole("administrador", null)
    const response = await call(dashboardIndex, "/api/v1/dashboard")
    expect(response.status).toBe(200)
    expect(response.json).toEqual({
      metrics: [
        { key: "progress", label: "Avance del proceso", value: 8, suffix: "%", hint: "1 de 13 sílabos aprobados" },
        { key: "days_left", label: "Días para la entrega", value: 7, suffix: "días", hint: "Entrega hasta el 30 de noviembre" },
        { key: "careers_without_convocation", label: "Carreras sin abrir", value: 0, suffix: null, hint: "Coordinaciones que aún no abren su proceso de sílabos" },
        { key: "not_started", label: "Sílabos sin iniciar", value: 11, suffix: null, hint: "Docentes que todavía no empiezan" },
      ],
      setup: {
        title: "Antes de empezar",
        intro: "Para abrir solo se exige la plantilla; lo demás lo necesita cada coordinación para empezar la suya.",
        done: 6,
        total: 6,
        steps: [
          { key: "faculties", label: "Registrar las facultades", hint: "Cargue el logo de cada facultad; Coordinación lo necesita para abrir su proceso de sílabos.", done: true, action: null },
          { key: "careers", label: "Registrar las carreras", hint: "Cada carrera registra su modalidad aprobada. Puede importarlas desde Excel.", done: true, action: null },
          { key: "accounts", label: "Crear las cuentas de coordinación y de biblioteca", hint: "Al menos una de cada una, también por importación desde Excel. Los docentes los crea cada Coordinación.", done: true, action: null },
          { key: "coordinators", label: "Asignar un coordinador a cada carrera", hint: "Todas las carreras tienen coordinador.", done: true, action: null },
          { key: "template", label: "Armar la plantilla del sílabo", hint: TEMPLATE_HINT, done: true, action: null },
          {
            key: "process",
            label: "Abrir el proceso de sílabos",
            hint: "Desde Periodos académicos, indique las fechas del periodo lectivo y de elaboración y entrega; cada Coordinación abrirá después el de su carrera.",
            done: true,
            action: null,
          },
        ],
      },
      deadline: null,
      coordination_convocation: null,
    })
    expect(response.text).toContain('"hint":"1 de 13 sílabos aprobados"')
    expect(calls).toContain(`counts:${PROCESS}`)
  })

  it("tells Administration the deadline has passed and that nothing runs without a process", async () => {
    asRole("administrador", null)
    let metrics = (await call(dashboardIndex, "/api/v1/dashboard", "2026-12-02")).json?.metrics as Record<string, unknown>[]
    expect(metrics[1]).toEqual({ key: "days_left", label: "Días para la entrega", value: 0, suffix: "días", hint: "El plazo venció el 30 de noviembre" })
    inProgress = null
    metrics = (await call(dashboardIndex, "/api/v1/dashboard")).json?.metrics as Record<string, unknown>[]
    expect(metrics.map((metric) => [metric.value, metric.hint])).toEqual([
      [0, "Sin proceso en curso"],
      [0, "Sin proceso en curso"],
      [0, "Sin proceso en curso"],
      [0, "Docentes que todavía no empiezan"],
    ])
  })

  it("keeps the template step pending until the template can be used, and says what is missing", async () => {
    asRole("administrador", null)
    const templateStep = async () => ((await call(dashboardIndex, "/api/v1/dashboard")).json?.setup as { steps: Record<string, unknown>[] }).steps[4]
    template = null
    expect(await templateStep()).toMatchObject({ done: false, hint: TEMPLATE_HINT })
    template = officialTemplate()
    template.sections = template.sections.filter((section) => section.key !== "identificacion")
    expect(await templateStep()).toMatchObject({ done: false, hint: "La plantilla no tiene las áreas obligatorias: identificacion." })
    setup.processExists = false
    expect(((await call(dashboardIndex, "/api/v1/dashboard")).json?.setup as { done: number }).done).toBe(4)
  })

  it("does not claim an active coordination without careers, and offers to open the process only when every step is done", async () => {
    asRole("administrador", null)
    const steps = async () => ((await call(dashboardIndex, "/api/v1/dashboard")).json?.setup as { steps: Record<string, unknown>[] }).steps
    setup.processExists = false
    setup.activeCareers = 0
    expect((await steps())[3]).toMatchObject({ done: false, hint: "Primero registre las carreras." })
    expect((await steps())[3].done).toBe(false)
    setup.activeCareers = 3
    setup.withoutCoordinator = 1
    expect((await steps())[3]).toMatchObject({ done: false, hint: "Faltan 1 de 3 carreras. No impide abrir." })
    expect((await steps())[5]).toMatchObject({ done: false, action: "open_process" })
    setup.withoutCoordinator = 0
    expect((await steps())[5]).toMatchObject({ done: false, action: "open_process" })
  })

  it("gives Coordination its checklist in dependency order, its deadline and its convocation", async () => {
    asRole("coordinador")
    inProgress = process({ startsOn: "2026-11-25", dueOn: "2026-12-02" })
    const response = await call(dashboardIndex, "/api/v1/dashboard")
    expect(response.status).toBe(200)
    const body = response.json as unknown as DashboardBody
    expect(body.metrics).toEqual([])
    expect(body.setup.steps.map((item) => item.key)).toEqual(["curriculum", "scheduled_subjects", "teachers", "parallels", "career_project", "convocation"])
    expect(body.setup.steps[1].hint).toBe("Registre las materias que se impartirán en 2026-2.")
    expect(body.setup.steps[3]).toMatchObject({ key: "parallels", done: false, hint: "1 de 2 paralelos tienen un docente vigente. No impide empezar." })
    expect(body.setup.steps[4]).toMatchObject({ done: true, hint: "Completo en las 2 materias." })
    expect(body.setup.steps[5]).toEqual({
      key: "convocation",
      label: "Abrir el proceso de sílabos de la carrera",
      hint: "Administración debe cargar el logo de la facultad.",
      done: false,
      action: null,
    })
    expect(body.deadline).toEqual(deadline({ state: "upcoming", starts_at: "2026-11-25", due_at: "2026-12-02", days_until_start: 2, days_until_due: 9, career_pending: true }))
    expect(body.coordination_convocation).toEqual({ process_id: PROCESS, period: "2026-2", convocation_id: null, can_open: false, can_resume: false, state: null, process_open: true })
    expect(calls).toContain("readiness:c-1")
    expect(calls).toContain(`convocation:c-1:${PROCESS}`)
  })

  it("requires a complete career project before opening the convocation", async () => {
    asRole("coordinador")
    template = goldenTemplate()
    const steps = ((await call(dashboardIndex, "/api/v1/dashboard")).json?.setup as { steps: Record<string, unknown>[] }).steps
    expect(steps[4]).toMatchObject({ label: "Completar el proyecto de carrera", done: false, hint: "Falta en 2 de 2 materias." })
    expect(steps[5].hint).toBe("Administración debe cargar el logo de la facultad.")
  })

  it("shows Coordination its open convocation and no checklist action once opened", async () => {
    asRole("coordinador")
    convocation = { id: CONVOCATION, state: "abierto" }
    const body = (await call(dashboardIndex, "/api/v1/dashboard")).json as unknown as DashboardBody
    expect(body.setup.done).toBe(5)
    expect(body.setup.steps[5]).toMatchObject({ done: true, action: null, hint: "Administración debe cargar el logo de la facultad." })
    expect(body.deadline).toEqual(deadline({ convocation_id: CONVOCATION }))
    expect(body.coordination_convocation).toEqual({ process_id: PROCESS, period: "2026-2", convocation_id: CONVOCATION, can_open: false, can_resume: false, state: "abierto", process_open: true })
  })

  it("waits for Administration without a process in progress", async () => {
    asRole("coordinador")
    inProgress = null
    const body = (await call(dashboardIndex, "/api/v1/dashboard")).json as unknown as DashboardBody
    expect(body.deadline).toBeNull()
    expect(body.coordination_convocation).toBeNull()
    expect(body.setup.steps[1].hint).toBe("Espera a que Administración abra el proceso de sílabos para saber cuál es.")
    expect(body.setup.steps[5].hint).toBe("Espera a que Administración abra el proceso de sílabos.")
  })

  it("answers Laravel's model 404 for a missing career and uses the official definition for a template without one", async () => {
    asRole("coordinador")
    setup.readiness = null
    const missing = await call(dashboardIndex, "/api/v1/dashboard")
    expect(missing.status).toBe(404)
    expect(missing.text).toContain("No query results for model [App\\\\Modules\\\\Academic\\\\Infrastructure\\\\Persistence\\\\Models\\\\Career]")
    asRole("administrador", null)
    template = officialTemplate()
    expect((await call(dashboardIndex, "/api/v1/dashboard")).status).toBe(200)
  })

  it("asks for an active role", async () => {
    world.assignments = []
    world.sessions.set(SESSION_ID, { payload: sessionPayload(loggedInAttributes({ active_role_assignment_id: undefined })), lastActivity: NOW })
    expect((await call(dashboardIndex, "/api/v1/dashboard")).status).toBe(409)
    expect((await call(dashboardDeadline, "/api/v1/dashboard/deadline")).status).toBe(409)
  })
})
