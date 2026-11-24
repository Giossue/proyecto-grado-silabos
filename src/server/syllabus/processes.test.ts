// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { phpJsonEncode } from "../laravel/phpJson"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import { fakeTemplateStore, goldenTemplate, type FakeTemplateWorld } from "../configuration/testing"
import { pauseProcess, processImpact, syllabusProcesses, type ProcessDeps, type ProcessRow } from "./processes"

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'
const PROCESS = "cd000000-0000-4000-8000-000000000001"
const CLOSED = "cd000000-0000-4000-8000-000000000002"

let world: FakeWorld
let templates: FakeTemplateWorld
let forwarded: Request[]
let rows: ProcessRow[]
let lockedState: string | null
let log: string[]
let audits: AuditEventInput[]
let today: string
let hasFields: boolean

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
    bridge: fakeDeps(world, forwarded),
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
            recordAudit: async (event) => {
              log.push("audit")
              audits.push(event)
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
  forwarded = []
  rows = [process(), process({ id: CLOSED, state: "cerrado", period: "2026-1", startsOn: "2026-04-01", dueOn: "2026-05-01", periodEndsOn: "2026-08-30", extensions: 1, convocationsCount: 0 })]
  lockedState = "abierto"
  log = []
  audits = []
  today = "2026-11-23"
  hasFields = true
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
    expect((await send((request) => processImpact(request, "cd000000-0000-4000-8000-00000000ffff", deps()), "/x")).status).toBe(299)
    world.assignments = [makeAssignment({ role: "docente" })]
    expect((await send((request) => processImpact(request, PROCESS, deps()), "/x")).text).toBe(FORBIDDEN)
  })
})

describe("POST /api/v1/admin/processes/{process}/pausar", () => {
  const pause = (body?: unknown) => send((request) => pauseProcess(request, PROCESS, deps()), `/api/v1/admin/processes/${PROCESS}/pausar`, "POST", body)

  it("pauses an open process under a row lock and audits the previous state", async () => {
    const { status, text } = await pause({ reason: "Se corrige la configuración institucional." })
    expect(status).toBe(200)
    expect(text).toBe(phpJsonEncode({ message: "Proceso en pausa. Los envíos se detienen y la plantilla queda editable." }))
    expect(log).toEqual(["begin", `lock:${PROCESS}`, `pause:${PROCESS}`, "audit", "commit"])
    expect(audits).toEqual([
      { actorId: golden.userId, roleAssignmentId: golden.roleId, action: "proceso_silabos.pausado", resourceType: "proceso_silabos", resourceId: PROCESS, result: "exito", metadata: { previous_state: "abierto" }, occurredAt: NOW },
    ])
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
    expect(audits).toEqual([])
  })
})
