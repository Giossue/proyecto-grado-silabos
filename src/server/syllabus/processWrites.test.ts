// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { phpJsonEncode } from "../laravel/phpJson"
import { fakeNotificationTransaction, notificationWorld, recipient, type NotificationWorld } from "../notifications/testing"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import type { ProcessRow } from "./processes"
import { deleteProcess, extendProcessDeadline, resumeProcess, type LockedSyllabusProcess, type ProcessWriteDeps } from "./processWrites"
import { NeedsLaravel } from "./snapshotDocuments"

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const FORBIDDEN = phpJsonEncode({ message: "No tiene permiso para hacer esto." })
const PROCESS = "cd000000-0000-4000-8000-000000000001"
const PERIOD = "ce000000-0000-4000-8000-000000000001"
const CONVOCATION = "cc000000-0000-4000-8000-000000000001"
const TEACHER = "a0000000-0000-4000-8000-0000000000aa"
const COORDINATOR = "a0000000-0000-4000-8000-0000000000cc"
const LIBRARIAN = "a0000000-0000-4000-8000-0000000000dd"
const SYLLABI = ["50000000-0000-4000-8000-000000000001", "50000000-0000-4000-8000-000000000002"]
const NOTICE = "Se repite la convocatoria con la malla corregida."

let world: FakeWorld
let forwarded: Request[]
let notices: NotificationWorld
let row: ProcessRow | null
let locked: LockedSyllabusProcess | null
let problem: string | null
let templateChanged: boolean
let log: string[]
let audits: AuditEventInput[]

function deps(): ProcessWriteDeps {
  return {
    bridge: fakeDeps(world, forwarded),
    find: async (id) => (row !== null && row.id === id.toLowerCase() ? row : null),
    now: () => NOW,
    nowMs: () => NOW * 1000 + 7,
    async transaction(work) {
      log.push("begin")
      const staged: AuditEventInput[] = []
      try {
        const result = await fakeNotificationTransaction(notices, NOW, (notifications) =>
          work({
            notifications,
            lockProcess: async (id) => {
              log.push(`lock:process:${id}`)
              return locked
            },
            lockConvocations: async () => {
              log.push("lock:convocations")
              return [CONVOCATION]
            },
            lockSyllabi: async () => {
              log.push("lock:syllabi")
              return SYLLABI
            },
            teachersForProcess: async () => [TEACHER, golden.userId],
            coordinatorsForProcess: async () => [COORDINATOR, TEACHER],
            librarians: async () => [LIBRARIAN],
            teacherSyllabusCounts: async () => new Map([[TEACHER, 2]]),
            purge: async (ids) => {
              log.push(`purge:${ids.length}`)
            },
            deleteProcess: async (id, convocations) => {
              log.push(`delete:${id}:${convocations.join(",")}`)
            },
            templateProblem: async () => problem,
            templateChangedDuringPause: async () => templateChanged,
            openConvocations: async () => [{ id: CONVOCATION, careerLabel: "Software" }],
            extendDeadline: async (id, dueAt, extension) => {
              log.push(`deadline:${id}:${dueAt}:${extension}`)
            },
            convocationCount: async () => 2,
            teachersWithPendingWork: async () => [TEACHER],
            updateState: async (id, state) => {
              log.push(`state:${id}:${state}`)
            },
            recordAudit: async (event) => {
              staged.push(event)
            },
          }),
        )
        audits.push(...staged)
        log.push("commit")
        return result
      } catch (error) {
        log.push("rollback")
        throw error
      }
    },
  }
}

async function send(handler: (request: Request) => Promise<Response>, path: string, method: string, body?: unknown) {
  const request = new Request(
    apiRequest(path, { cookie, method, headers: { "x-csrf-token": golden.csrfToken, ...(body === undefined ? {} : { "content-type": "application/json" }) } }),
    body === undefined ? {} : { body: JSON.stringify(body) },
  )
  const response = await handler(request)
  const text = await response.text()
  return { status: response.status, text, json: text.startsWith("{") ? (JSON.parse(text) as Record<string, unknown>) : null }
}

const destroy = (body?: unknown, id = PROCESS) => send((request) => deleteProcess(request, id, deps()), `/api/v1/admin/processes/${id}`, "DELETE", body)
const resume = (body?: unknown, id = PROCESS) => send((request) => resumeProcess(request, id, deps()), `/api/v1/admin/processes/${id}/reanudar`, "POST", body)

beforeEach(() => {
  world = {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "administrador", careerId: null })],
  }
  forwarded = []
  notices = notificationWorld({
    users: [recipient(TEACHER), recipient(COORDINATOR), recipient(LIBRARIAN), recipient(golden.userId)],
    periods: new Map([[`convocatoria:${CONVOCATION}`, PERIOD], [`proceso_silabos:${PROCESS}`, PERIOD]]),
  })
  row = { id: PROCESS, state: "abierto", period: "2026-2", periodId: PERIOD, periodEndsOn: "2027-03-12", startsOn: "2026-11-10", dueOn: "2026-12-10", convocationsCount: 1, extensions: 0 }
  locked = { id: PROCESS, state: "abierto", periodId: PERIOD, period: "2026-2", dueAt: Date.UTC(2026, 11, 11, 4, 59, 59) / 1000, extensions: 0, periodEndsOn: "2027-03-12" }
  problem = null
  templateChanged = false
  log = []
  audits = []
})

describe("DELETE /api/v1/admin/processes/{process}", () => {
  it("erases the process with all its work and tells everyone involved except the administrator", async () => {
    const response = await destroy({ mensaje: `  ${NOTICE}  ` })
    expect(response.text).toBe(phpJsonEncode({ message: "Convocatoria institucional eliminada." }))
    expect(log).toEqual(["begin", `lock:process:${PROCESS}`, "lock:convocations", "lock:syllabi", "purge:2", `delete:${PROCESS}:${CONVOCATION}`, "commit"])
    const message = `Se borraron todos los sílabos de 2026-2. Mensaje de Administración: ${NOTICE}`
    expect(notices.notifications.map((item) => [item.userId, item.key, item.title, item.message, item.resourceType, item.resourceId, item.periodId])).toEqual([
      [TEACHER, `flujo:proceso.eliminado:${PROCESS}`, "Convocatoria eliminada", message, "periodo_academico", PERIOD, PERIOD],
      [COORDINATOR, `flujo:proceso.eliminado:${PROCESS}`, "Convocatoria eliminada", message, "periodo_academico", PERIOD, PERIOD],
      [LIBRARIAN, `flujo:proceso.eliminado:${PROCESS}`, "Convocatoria eliminada", message, "periodo_academico", PERIOD, PERIOD],
    ])
    expect(notices.mails).toHaveLength(3)
    expect(audits.map((event) => [event.action, event.resourceType, event.resourceId, event.metadata])).toEqual([
      [
        "proceso_silabos.eliminado",
        "proceso_silabos",
        PROCESS,
        { period_id: PERIOD, previous_state: "abierto", deleted_convocations: 1, deleted_syllabi: 2, notified_people: 3 },
      ],
    ])
  })

  it("asks for the message with its own wording", async () => {
    const ask = "Escriba el mensaje para docentes, coordinación y biblioteca."
    expect((await destroy({})).json).toEqual({ message: ask, errors: { mensaje: [ask] } })
    expect((await destroy({ mensaje: ["x"] })).json?.errors).toEqual({ mensaje: [ask] })
    expect((await destroy({ mensaje: "ñ".repeat(1001) })).json?.errors).toEqual({ mensaje: ["El mensaje no puede pasar de 1000 caracteres."] })
    expect((await destroy({ mensaje: "ñ".repeat(1000) })).status).toBe(200)
  })

  it("is forbidden for other roles and for closed processes", async () => {
    world.assignments = [makeAssignment({ role: "coordinador", careerId: "c-1" })]
    expect((await destroy({ mensaje: NOTICE })).text).toBe(FORBIDDEN)
    world.assignments = [makeAssignment({ role: "administrador", careerId: null })]
    row = { ...(row as ProcessRow), state: "cerrado" }
    expect((await destroy({ mensaje: NOTICE })).text).toBe(FORBIDDEN)
    expect(log).toEqual([])
  })

  it("leaves a process closed under the lock untouched", async () => {
    locked = { ...(locked as LockedSyllabusProcess), state: "cerrado" }
    expect((await destroy({ mensaje: NOTICE })).json?.errors).toEqual({ process: ["Una convocatoria cerrada no se elimina: queda como historial."] })
    expect(log).not.toContain("purge:2")
    expect(notices.notifications).toEqual([])
  })
})

describe("POST /api/v1/admin/processes/{process}/reanudar", () => {
  beforeEach(() => {
    row = { ...(row as ProcessRow), state: "pausado" }
    locked = { ...(locked as LockedSyllabusProcess), state: "pausado" }
  })

  it("reopens the process, audits it and tells teachers, coordination and the library", async () => {
    const response = await resume()
    expect(response.text).toBe(phpJsonEncode({ message: "Proceso reanudado. Los envíos vuelven a admitirse." }))
    expect(log).toEqual(["begin", `lock:process:${PROCESS}`, `state:${PROCESS}:abierto`, "commit"])
    expect(audits.map((event) => [event.action, event.metadata])).toEqual([["proceso_silabos.abierto", { previous_state: "pausado" }]])
    const at = "20270115080000007"
    expect(notices.notifications.map((item) => [item.userId, item.key, item.title, item.message, item.resourceType])).toEqual([
      [TEACHER, `flujo:convocatoria.reanudada:${CONVOCATION}:${TEACHER}:${at}`, "Se reanudó la convocatoria", "Ya puede seguir con sus sílabos de Software.", "convocatoria"],
      [
        COORDINATOR,
        `flujo:proceso.reanudado:${PROCESS}:${COORDINATOR}:${at}`,
        "Administración reanudó la convocatoria",
        "Se retoman la edición y las revisiones de los sílabos del período 2026-2.",
        "proceso_silabos",
      ],
      [TEACHER, `flujo:proceso.reanudado:${PROCESS}:${TEACHER}:${at}`, "Administración reanudó la convocatoria", "Se retoman la edición y las revisiones de los sílabos del período 2026-2.", "proceso_silabos"],
      [LIBRARIAN, `flujo:proceso.reanudado:${PROCESS}:${LIBRARIAN}:${at}`, "Administración reanudó la convocatoria", "Se retoman la edición y las revisiones de los sílabos del período 2026-2.", "proceso_silabos"],
    ])
  })

  it("validates confirmar_rehacer as a boolean when present", async () => {
    expect((await resume({ confirmar_rehacer: "quizá" })).json?.errors).toEqual({
      confirmar_rehacer: ["El campo confirmación para rehacer los sílabos debe ser verdadero o falso."],
    })
    expect(log).toEqual([])
  })

  it("is forbidden unless an administrator resumes a paused process", async () => {
    row = { ...(row as ProcessRow), state: "abierto" }
    expect((await resume()).text).toBe(FORBIDDEN)
    row = { ...(row as ProcessRow), state: "pausado" }
    world.assignments = [makeAssignment({ role: "docente", careerId: "c-1" })]
    expect((await resume()).text).toBe(FORBIDDEN)
  })

  it("rejects under the lock when the state changed or the template is not usable", async () => {
    locked = { ...(locked as LockedSyllabusProcess), state: "abierto" }
    expect((await resume()).json?.errors).toEqual({ process: ["El proceso no está en un estado que admita esta acción."] })
    locked = { ...(locked as LockedSyllabusProcess), state: "pausado" }
    problem = "La sección «Datos» de la plantilla está vacía."
    expect((await resume()).json?.errors).toEqual({ process: [problem] })
    expect(audits).toEqual([])
    expect(notices.notifications).toEqual([])
  })

  it("leaves a resume after a template change to Laravel, which asks to confirm and adapts the syllabi", async () => {
    templateChanged = true
    expect((await resume({ confirmar_rehacer: true })).status).toBe(299)
    expect(log.at(-1)).toBe("rollback")
    expect(audits).toEqual([])
    expect(forwarded).toHaveLength(1)
    expect(await forwarded[0].text()).toBe('{"confirmar_rehacer":true}')
    expect(NeedsLaravel).toBeDefined()
  })
})

describe("POST /api/v1/admin/processes/{process}/deadline", () => {
  const extend = (body?: unknown) => send((request) => extendProcessDeadline(request, PROCESS, { ...deps(), now: () => Date.UTC(2026, 10, 18, 12) / 1000 }), `/api/v1/admin/processes/${PROCESS}/deadline`, "POST", body)

  it("moves the deadline to the end of the chosen day, counts the extension and tells teachers with pending work", async () => {
    const response = await extend({ due_at: "2026-12-20" })
    expect(response.text).toBe(phpJsonEncode({ message: "Plazo prorrogado para todas las convocatorias del proceso." }))
    expect(log).toEqual(["begin", `lock:process:${PROCESS}`, `deadline:${PROCESS}:2026-12-21T04:59:59+00:00:1`, "commit"])
    expect(audits.map((event) => [event.action, event.metadata])).toEqual([
      [
        "proceso_silabos.plazo_extendido",
        {
          stage: "borrador",
          previous_due_at: "2026-12-11T04:59:59+00:00",
          new_due_at: "2026-12-21T04:59:59+00:00",
          convocations_reached: 2,
          extension_number: 1,
        },
      ],
    ])
    expect(notices.notifications.map((item) => [item.userId, item.key, item.title, item.message, item.resourceType])).toEqual([
      [
        TEACHER,
        `flujo:proceso.plazo_extendido:${PROCESS}:${Date.UTC(2026, 11, 21, 4, 59, 59) / 1000}`,
        "Plazo extendido",
        "La entrega de sílabos del proceso «2026-2» se amplió hasta el 20 de diciembre de 2026, 23:59.",
        "proceso_silabos",
      ],
    ])
    expect(notices.mails).toEqual([])
  })

  it("validates like ExtendProcessDeadlineRequest", async () => {
    expect((await extend({})).json?.errors).toEqual({ due_at: ["El campo fecha límite es obligatorio."] })
    expect((await extend({ due_at: "2026-12-20", stage: "inicio" })).json?.errors).toEqual({ stage: ["La prórroga solo modifica la fecha límite de entrega."] })
    expect((await extend({ due_at: "2026-12-20", confirmar_cambios: "x" })).json?.errors).toEqual({
      confirmar_cambios: ["El campo confirmación para aplicar los cambios pendientes debe ser verdadero o falso."],
    })
    expect(log).toEqual([])
  })

  it("rejects dates in the past, not after the current deadline or beyond the last class day", async () => {
    expect((await extend({ due_at: "2026-11-17" })).json?.errors).toEqual({ due_at: ["La nueva fecha ya pasó."] })
    expect((await extend({ due_at: "2026-12-10" })).json?.errors).toEqual({ due_at: ["La nueva fecha debe ser posterior a la vigente, que es el 10/12/2026."] })
    expect((await extend({ due_at: "2027-03-13" })).json?.errors).toEqual({ due_at: ["La nueva fecha no puede pasar del último día de clases (12/03/2027)."] })
    locked = { ...(locked as LockedSyllabusProcess), extensions: 2 }
    expect((await extend({ due_at: "2026-12-20" })).json?.errors).toEqual({ process: ["Ya se usaron las 2 prórrogas de esta convocatoria."] })
    expect(audits).toEqual([])
  })

  it("leaves reopening a closed process to Laravel and forbids non-administrators", async () => {
    locked = { ...(locked as LockedSyllabusProcess), state: "cerrado" }
    expect((await extend({ due_at: "2026-12-20" })).status).toBe(299)
    expect(log.at(-1)).toBe("rollback")
    world.assignments = [makeAssignment({ role: "coordinador", careerId: "c-1" })]
    expect((await extend({ due_at: "2026-12-20" })).text).toBe(FORBIDDEN)
  })
})
