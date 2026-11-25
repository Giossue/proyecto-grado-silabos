// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { phpJsonEncode } from "../http/phpJson"
import { fakeTemplateStore, goldenTemplate, type FakeTemplateWorld } from "../configuration/testing"
import { createProcess, pauseProcess, processImpact, syllabusProcesses, type ProcessDeps, type ProcessRow } from "./processes"

const modelNotFound = (model: string, id: string) => JSON.stringify({ message: `No query results for model [App\\Modules\\Syllabus\\Infrastructure\\Persistence\\Models\\${model}] ${id}` }, null, 4)

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'
const PROCESS = "cd000000-0000-4000-8000-000000000001"
const CLOSED = "cd000000-0000-4000-8000-000000000002"
const NEW_PROCESS = "cd000000-0000-4000-8000-000000000009"
const PERIOD = "e0000000-0000-4000-8000-000000000002"

let world: FakeWorld
let templates: FakeTemplateWorld
let rows: ProcessRow[]
let lockedState: string | null
let log: string[]
let today: string
let hasFields: boolean
let periodEnds: Map<string, string>
let activeCareers: number
let withoutCoordinator: number
let inProgress: { id: string; period: string | null } | null
let periodsWithProcess: Set<string>
let created: { periodId: string; startsAt: string; dueAt: string }[]

const process = (overrides: Partial<ProcessRow> = {}): ProcessRow => ({
  id: PROCESS,
  state: "abierto",
  period: "2026-2",
  periodId: "e0000000-0000-4000-8000-000000000001",
  periodEndsOn: "2027-03-20",
  startsOn: "2026-11-10",
  dueOn: "2026-12-10",
  convocationsCount: 2,
  extensions: 0,
  ...overrides,
})

function deps(): ProcessDeps {
  return {
    bridge: fakeDeps(world),
    templates: fakeTemplateStore(templates),
    today: () => today,
    now: () => NOW,
    processes: {
      list: async () => rows,
      templateHasFields: async () => hasFields,
      periods: async () => [{ id: "e0000000-0000-4000-8000-000000000001", codigo: "2026-2" }],
      find: async (id) => rows.find((row) => row.id === id.toLowerCase()) ?? null,
      counts: async () => [
        { state: "borrador", total: 3 },
        { state: "sin_iniciar", total: 5 },
      ],
      periodEndsOn: async (id) => periodEnds.get(id) ?? null,
      activeCareerCount: async () => activeCareers,
      activeCareersWithoutCoordinator: async () => withoutCoordinator,
      transaction: async (work) => {
        log.push("begin")
        try {
          const result = await work({
            lockProcess: async (id) => {
              log.push(`lock:${id}`)
              return lockedState
            },
            pause: async (id) => {
              log.push(`pause:${id}`)
            },
            lockInProgress: async () => {
              log.push("lock:in-progress")
              return inProgress
            },
            periodHasProcess: async (periodId) => periodsWithProcess.has(periodId),
            createProcess: async (periodId, startsAt, dueAt) => {
              log.push("create")
              created.push({ periodId, startsAt, dueAt })
              return NEW_PROCESS
            },
          })
          log.push("commit")
          return result
        } catch (error) {
          log.push("rollback")
          throw error
        }
      },
    },
  }
}

async function send(handler: (request: Request) => Promise<Response>, path: string, method = "GET", body?: unknown) {
  const base = apiRequest(path, { cookie, method, headers: { "x-csrf-token": golden.csrfToken, ...(body === undefined ? {} : { "content-type": "application/json" }) } })
  const response = await handler(body === undefined ? base : new Request(base, { body: JSON.stringify(body) }))
  const text = await response.text()
  return { status: response.status, text, json: text.startsWith("{") ? (JSON.parse(text) as Record<string, unknown>) : null }
}

beforeEach(() => {
  world = {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "administrador", careerId: null })],
  }
  templates = { template: goldenTemplate(), values: [] }
  rows = [process(), process({ id: CLOSED, state: "cerrado", period: "2026-1", startsOn: "2026-04-01", dueOn: "2026-05-01", periodEndsOn: "2026-08-30", extensions: 1, convocationsCount: 0 })]
  lockedState = "abierto"
  log = []
  today = "2026-11-23"
  hasFields = true
  periodEnds = new Map([[PERIOD, "2027-03-12"]])
  activeCareers = 2
  withoutCoordinator = 0
  inProgress = null
  periodsWithProcess = new Set()
  created = []
})

describe("GET /api/v1/admin/processes", () => {
  it("lists the processes with their extension limits, the template and the periods", async () => {
    const { status, text } = await send((request) => syllabusProcesses(request, deps()), "/api/v1/admin/processes")
    expect(status).toBe(200)
    expect(text).toBe(
      phpJsonEncode({
        processes: [
          {
            id: PROCESS,
            name: "2026-2",
            state: "abierto",
            template: "Plantilla institucional de sílabo",
            period_id: "e0000000-0000-4000-8000-000000000001",
            period_name: "2026-2",
            starts_at: "2026-11-10",
            due_at: "2026-12-10",
            convocations_count: 2,
            configurable: false,
            deletable: true,
            extensions_used: 0,
            extensions_max: 2,
            extension_limit_on: "2027-03-20",
            extension_block_reason: null,
          },
          {
            id: CLOSED,
            name: "2026-1",
            state: "cerrado",
            template: "Plantilla institucional de sílabo",
            period_id: "e0000000-0000-4000-8000-000000000001",
            period_name: "2026-1",
            starts_at: "2026-04-01",
            due_at: "2026-05-01",
            convocations_count: 0,
            configurable: false,
            deletable: false,
            extensions_used: 1,
            extensions_max: 2,
            extension_limit_on: "2026-08-30",
            extension_block_reason: "Las clases del período terminaron el 30/08/2026.",
          },
        ],
        template: "Plantilla institucional de sílabo",
        periods: [{ id: "e0000000-0000-4000-8000-000000000001", codigo: "2026-2" }],
        active_process: { name: "2026-2", period: "2026-2", state: "abierto" },
      }),
    )
  })

  it("explains every extension block in Laravel's order", async () => {
    const reasons = async (row: Partial<ProcessRow>) => {
      rows = [process(row)]
      return (JSON.parse((await send((request) => syllabusProcesses(request, deps()), "/api/v1/admin/processes")).text).processes[0] as { extension_block_reason: unknown }).extension_block_reason
    }
    expect(await reasons({ extensions: 2 })).toBe("Ya se usaron las 2 prórrogas de esta convocatoria.")
    expect(await reasons({ dueOn: "2027-03-20" })).toBe("El plazo ya llega al último día de clases (20/03/2027).")
    rows = [process({ state: "cerrado" }), process({ id: CLOSED, state: "pausado" })]
    const blocked = JSON.parse((await send((request) => syllabusProcesses(request, deps()), "/api/v1/admin/processes")).text)
    expect(blocked.processes[0].extension_block_reason).toBe("Hay otra convocatoria en curso; finalícela o elimínela antes de reabrir esta")
    expect(blocked.active_process).toEqual({ name: "2026-2", period: "2026-2", state: "pausado" })
    const template = goldenTemplate()
    template.sections[0].blocks[0].fields = []
    templates.template = template
    expect(await reasons({ state: "cerrado" })).toBe("La plantilla no está lista para usarse. Complétela; «Antes de empezar» indica qué falta.")
  })

  it("reports a template without fields as missing and forbids other roles", async () => {
    hasFields = false
    expect(JSON.parse((await send((request) => syllabusProcesses(request, deps()), "/api/v1/admin/processes")).text).template).toBeNull()
    world.assignments = [makeAssignment({ role: "coordinador" })]
    expect((await send((request) => syllabusProcesses(request, deps()), "/api/v1/admin/processes")).text).toBe(FORBIDDEN)
  })
})

describe("GET /api/v1/admin/processes/{process}/impact", () => {
  it("counts the syllabi of the process by state", async () => {
    const { text } = await send((request) => processImpact(request, PROCESS, deps()), `/api/v1/admin/processes/${PROCESS}/impact`)
    expect(text).toBe(phpJsonEncode({ syllabi: { sin_iniciar: 5, borrador: 3, en_revision: 0, correccion_solicitada: 0, aprobado: 0 }, total: 8 }))
  })

  it("forbids other roles and leaves unknown processes to Laravel", async () => {
    expect(await send((request) => processImpact(request, "cd000000-0000-4000-8000-00000000ffff", deps()), "/x")).toMatchObject({ status: 404, text: modelNotFound("SyllabusProcess", "cd000000-0000-4000-8000-00000000ffff") })
    expect(await send((request) => processImpact(request, "abc", deps()), "/x")).toMatchObject({ status: 404, text: modelNotFound("SyllabusProcess", "abc") })
    world.assignments = [makeAssignment({ role: "docente" })]
    expect((await send((request) => processImpact(request, PROCESS, deps()), "/x")).text).toBe(FORBIDDEN)
  })
})

describe("POST /api/v1/admin/processes/{process}/pausar", () => {
  const pause = (body?: unknown) => send((request) => pauseProcess(request, PROCESS, deps()), `/api/v1/admin/processes/${PROCESS}/pausar`, "POST", body)

  it("pauses an open process under a row lock", async () => {
    const { status, text } = await pause({ reason: "Se corrige la configuración institucional." })
    expect(status).toBe(200)
    expect(text).toBe(phpJsonEncode({ message: "Proceso en pausa. Los envíos se detienen y la plantilla queda editable." }))
    expect(log).toEqual(["begin", `lock:${PROCESS}`, `pause:${PROCESS}`, "commit"])
  })

  it("validates the rebuild confirmation", async () => {
    const { status, json } = await pause({ confirmar_rehacer: "quizá" })
    expect(status).toBe(422)
    expect(json?.errors).toEqual({ confirmar_rehacer: ["El campo confirmación para rehacer los sílabos debe ser verdadero o falso."] })
    expect(log).toEqual([])
  })

  it("forbids pausing a process that is not open and rejects a state changed under the lock", async () => {
    rows = [process({ state: "pausado" })]
    expect((await pause()).text).toBe(FORBIDDEN)
    rows = [process()]
    lockedState = "cerrado"
    expect((await pause()).json?.errors).toEqual({ process: ["El proceso no está en un estado que admita esta acción."] })
  })
})

describe("POST /api/v1/admin/processes", () => {
  const officialTemplate = () => {
    const template = goldenTemplate()
    return { ...template, sections: template.sections.filter((section) => section.key !== "sinteticos") }
  }
  const store = (body: unknown) => send((request) => createProcess(request, deps()), "/api/v1/admin/processes", "POST", body)
  const payload = (overrides: Record<string, unknown> = {}) => ({ period_id: PERIOD, starts_at: "2026-11-24", due_at: "2026-12-15", ...overrides })

  beforeEach(() => {
    templates.template = officialTemplate()
  })

  it("opens the institutional process with whole institution days", async () => {
    const response = await store(payload())
    expect(response).toMatchObject({ status: 201, text: '{"message":"Convocatoria institucional abierta. Las coordinaciones ya pueden iniciar sus convocatorias."}' })
    expect(created).toEqual([{ periodId: PERIOD, startsAt: "2026-11-24T05:00:00+00:00", dueAt: "2026-12-16T04:59:59+00:00" }])
    expect(log).toEqual(["begin", "lock:in-progress", "create", "commit"])
  })

  it("takes the institution day of an ISO instant, so the start can be today when UTC already moved on", async () => {
    today = "2026-11-23"
    await store(payload({ starts_at: "2026-11-24T00:30:00Z", due_at: "2026-11-30T12:00:00+00:00" }))
    expect(created).toEqual([{ periodId: PERIOD, startsAt: "2026-11-23T05:00:00+00:00", dueAt: "2026-12-01T04:59:59+00:00" }])
  })

  it("is reserved to Administration", async () => {
    world.assignments = [makeAssignment({ role: "coordinador", careerId: "c-1" })]
    expect(await store(payload())).toMatchObject({ status: 403, text: FORBIDDEN })
    expect(created).toEqual([])
  })

  it("requires the period and both dates explicitly", async () => {
    const response = await store({ period_id: PERIOD })
    expect(response.status).toBe(422)
    expect(response.json).toEqual({
      message: "El campo fecha de inicio es obligatorio. (y 1 error más)",
      errors: { starts_at: ["El campo fecha de inicio es obligatorio."], due_at: ["El campo fecha límite es obligatorio."] },
    })
    expect((await store(payload({ period_id: undefined }))).json?.errors).toEqual({ period_id: ["El campo periodo académico es obligatorio."] })
    expect((await store(payload({ period_id: "e0000000-0000-4000-8000-0000000000ff" }))).json?.errors).toEqual({
      period_id: ["El valor seleccionado en periodo académico no es válido."],
    })
    expect(created).toEqual([])
  })

  it("starts today at the earliest and keeps both dates inside the period", async () => {
    expect((await store(payload({ starts_at: "2026-11-22" }))).json?.errors).toEqual({ starts_at: ["El inicio no puede ser anterior a hoy."] })
    expect((await store(payload({ due_at: "2026-11-20" }))).json?.errors).toEqual({ due_at: ["La fecha de entrega debe ser posterior al inicio y a hoy."] })
    expect((await store(payload({ starts_at: "2026-12-01", due_at: "2026-11-30" }))).json?.errors).toEqual({
      due_at: ["La fecha de entrega debe ser posterior al inicio y a hoy."],
    })
    expect((await store(payload({ due_at: "2027-03-13" }))).json?.errors).toEqual({ due_at: ["La fecha no puede pasar del fin del período (12/03/2027)."] })
    expect((await store(payload({ due_at: "2027-03-12" }))).status).toBe(201)
  })

  it("rejects a period that already ended", async () => {
    periodEnds.set(PERIOD, "2026-11-20")
    expect((await store(payload())).json?.errors).toEqual({ period_id: ["El período académico ya terminó (20/11/2026). Elija uno vigente."] })
  })

  it("does not open without a usable template, active careers or an active coordination for each", async () => {
    templates.template = null
    expect((await store(payload())).json).toEqual({
      message: "La plantilla institucional está vacía. Aplique el formato oficial o configure sus bloques antes de abrir la convocatoria.",
      errors: { process: ["La plantilla institucional está vacía. Aplique el formato oficial o configure sus bloques antes de abrir la convocatoria."] },
    })
    templates.template = officialTemplate()
    templates.template.sections = templates.template.sections.filter((section) => section.key !== "revision")
    expect((await store(payload())).json?.errors).toEqual({ process: ["La plantilla no tiene las áreas obligatorias: revision."] })
    templates.template = officialTemplate()
    activeCareers = 0
    expect((await store(payload())).json?.errors).toEqual({ process: ["No existen carreras activas en la estructura institucional."] })
    activeCareers = 2
    withoutCoordinator = 1
    expect((await store(payload())).json?.errors).toEqual({ process: ["La estructura institucional no está lista: 1 carrera(s) sin coordinación activa."] })
    expect(created).toEqual([])
    expect(log).toEqual([])
  })

  it("keeps a single process in progress and one process per period", async () => {
    inProgress = { id: PROCESS, period: "2026-2" }
    expect((await store(payload())).json?.errors).toEqual({
      process: ["La convocatoria «2026-2» sigue vigente. Finalícela o elimínela antes de abrir otra convocatoria institucional."],
    })
    inProgress = null
    periodsWithProcess.add(PERIOD)
    expect((await store(payload())).json?.errors).toEqual({ period_id: ["Ya existe una convocatoria institucional para este período académico."] })
    expect(created).toEqual([])
    expect(log.filter((entry) => entry === "rollback")).toHaveLength(2)
  })

  it("reads dates like ProcessDates and the date rule, and validates forms and malformed periods natively", async () => {
    expect(await store(payload({ starts_at: "mañana" }))).toMatchObject({ status: 422, text: expect.stringContaining("El campo fecha de inicio debe ser una fecha v\\u00e1lida.") })
    expect(await store(payload({ period_id: "abc" }))).toMatchObject({ status: 422, text: expect.stringContaining("periodo acad\\u00e9mico debe ser un UUID") })
    const form = await createProcess(
      new Request(apiRequest("/api/v1/admin/processes", { cookie, method: "POST", headers: { "x-csrf-token": golden.csrfToken, "content-type": "application/x-www-form-urlencoded" } }), {
        body: "period_id=x",
      }),
      deps(),
    )
    expect(form.status).toBe(422)
    expect(created).toEqual([])
    expect((await store(payload({ starts_at: "2026/11/24", due_at: "2026-11-30 12:00" }))).status).toBe(201)
    expect(created.at(-1)).toEqual({ periodId: PERIOD, startsAt: "2026-11-24T05:00:00+00:00", dueAt: "2026-12-01T04:59:59+00:00" })
  })

  it("rolls an impossible plain day over like Carbon, and refuses without an institutional template", async () => {
    expect((await store(payload({ due_at: "2026-11-31" }))).status).toBe(201)
    expect(created.at(-1)?.dueAt).toBe("2026-12-02T04:59:59+00:00")
    templates.template = null
    expect(await store(payload())).toMatchObject({ status: 422, text: expect.stringContaining("La plantilla institucional est\\u00e1 vac\\u00eda.") })
  })
})
