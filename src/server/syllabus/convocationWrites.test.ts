// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { phpJsonEncode } from "../laravel/phpJson"
import { fakeNotificationTransaction, notificationWorld, recipient, type NotificationWorld } from "../notifications/testing"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import { createConvocation, resumeConvocation, type ConvocationWriteDeps, type LockedConvocation, type LockedProcess } from "./convocationWrites"
import type { ConvocationRecord } from "./convocations"
import { GenerationRejected } from "./inProgressWork"

const modelNotFound = (model: string, id: string) => JSON.stringify({ message: `No query results for model [App\\Modules\\Syllabus\\Infrastructure\\Persistence\\Models\\${model}] ${id}` }, null, 4)

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const FORBIDDEN = phpJsonEncode({ message: "No tiene permiso para hacer esto." })
const CAREER = "c0000000-0000-4000-8000-000000000001"
const PROCESS = "cd000000-0000-4000-8000-000000000001"
const PERIOD = "ce000000-0000-4000-8000-000000000001"
const CONVOCATION = "cc000000-0000-4000-8000-000000000001"
const TEACHER = "a0000000-0000-4000-8000-0000000000aa"
const OTHER_TEACHER = "a0000000-0000-4000-8000-0000000000bb"
const DUE_AT = Date.UTC(2026, 11, 11, 4, 59, 59) / 1000

let world: FakeWorld
let forwarded: Request[]
let notices: NotificationWorld
let record: ConvocationRecord | null
let openProcesses: Set<string>
let process: LockedProcess | null
let existing: boolean
let locked: LockedConvocation | null
let blockers: string[]
let problem: string | null
let generation: number | GenerationRejected
let counts: Map<string, number>
let log: string[]
let audits: AuditEventInput[]

function deps(): ConvocationWriteDeps {
  return {
    bridge: fakeDeps(world, forwarded),
    convocation: async (id) => (record !== null && record.id === id.toLowerCase() ? record : null),
    openProcessExists: async (id) => openProcesses.has(id),
    now: () => NOW,
    nowMs: () => NOW * 1000 + 123,
    async transaction(work) {
      log.push("begin")
      const staged: AuditEventInput[] = []
      try {
        const result = await fakeNotificationTransaction(notices, NOW, (notifications) =>
          work({
            notifications,
            async generateConvocation(id, options) {
              log.push(`generate:${id}:${JSON.stringify(options ?? {})}`)
              if (generation instanceof GenerationRejected) throw generation
              return generation
            },
            teacherSyllabusCounts: async () => counts,
            lockProcess: async (id) => {
              log.push(`lock:process:${id}`)
              return process
            },
            careerHasConvocation: async () => existing,
            createConvocation: async (career, processId) => {
              log.push(`create:${career}:${processId}`)
              locked = { id: CONVOCATION, careerId: career, careerLabel: "Software", state: "preparacion", processState: "abierto", dueAt: DUE_AT }
              return CONVOCATION
            },
            lockConvocation: async (id) => {
              log.push(`lock:convocation:${id}`)
              return locked
            },
            readinessBlockers: async () => blockers,
            templateProblem: async () => problem,
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

async function send(handler: (request: Request) => Promise<Response>, path: string, body?: unknown) {
  const request = new Request(
    apiRequest(path, { cookie, method: "POST", headers: { "x-csrf-token": golden.csrfToken, ...(body === undefined ? {} : { "content-type": "application/json" }) } }),
    body === undefined ? {} : { body: JSON.stringify(body) },
  )
  const response = await handler(request)
  const text = await response.text()
  return { status: response.status, text, json: text.startsWith("{") ? (JSON.parse(text) as Record<string, unknown>) : null }
}

const store = (body: unknown) => send((request) => createConvocation(request, deps()), "/api/v1/coordination/convocations", body)
const resume = (id = CONVOCATION) => send((request) => resumeConvocation(request, id, deps()), `/api/v1/coordination/convocations/${id}/reanudar`)

beforeEach(() => {
  world = {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "coordinador", careerId: CAREER })],
  }
  forwarded = []
  notices = notificationWorld({
    users: [recipient(TEACHER, { name: "Ana Pérez", email: "ana@ueb.edu.ec" }), recipient(OTHER_TEACHER, { name: "Luis Mora", email: "luis@ueb.edu.ec" })],
    periods: new Map([[`convocatoria:${CONVOCATION}`, PERIOD]]),
  })
  record = { id: CONVOCATION, careerId: CAREER, career: "Software", state: "pausada", processState: "abierto", period: "2026-2", startsOn: "2026-11-10", dueOn: "2026-12-10" }
  openProcesses = new Set([PROCESS])
  process = { id: PROCESS, state: "abierto", periodId: PERIOD }
  existing = false
  locked = { id: CONVOCATION, careerId: CAREER, careerLabel: "Software", state: "pausada", processState: "abierto", dueAt: DUE_AT }
  blockers = []
  problem = null
  generation = 3
  counts = new Map([
    [TEACHER, 2],
    [OTHER_TEACHER, 1],
  ])
  log = []
  audits = []
})

describe("POST /api/v1/coordination/convocations", () => {
  it("starts the career convocation, opens it, generates its syllabi and tells each teacher what to write", async () => {
    const response = await store({ process_id: PROCESS })
    expect(response.status).toBe(201)
    expect(response.text).toBe(phpJsonEncode({ message: "Convocatoria iniciada: se generó un sílabo por cada paralelo.", convocation_id: CONVOCATION }))
    expect(log).toEqual([
      "begin",
      `lock:process:${PROCESS}`,
      `create:${CAREER}:${PROCESS}`,
      `lock:convocation:${CONVOCATION}`,
      `generate:${CONVOCATION}:{}`,
      `state:${CONVOCATION}:abierta`,
      "commit",
    ])
    expect(audits.map((event) => [event.action, event.resourceType, event.resourceId, event.metadata])).toEqual([
      ["convocatoria.iniciada", "convocatoria", CONVOCATION, { process_id: PROCESS, period_id: PERIOD }],
      ["convocatoria.abierta", "convocatoria", CONVOCATION, { generated_count: 3 }],
    ])
    const message = "Se abrió la convocatoria de Software; la entrega vence el 10 de diciembre de 2026, 23:59."
    expect(notices.notifications.map((item) => [item.userId, item.key, item.title, item.message, item.resourceType, item.resourceId, item.periodId])).toEqual([
      [TEACHER, `flujo:convocatoria.abierta:${CONVOCATION}:${TEACHER}`, "Tiene 2 sílabos por elaborar", message, "convocatoria", CONVOCATION, PERIOD],
      [OTHER_TEACHER, `flujo:convocatoria.abierta:${CONVOCATION}:${OTHER_TEACHER}`, "Tiene un sílabo por elaborar", message, "convocatoria", CONVOCATION, PERIOD],
    ])
    expect(notices.mails.map((mail) => [mail.to, mail.data])).toEqual([
      ["ana@ueb.edu.ec", { name: "Ana Pérez", title: "Tiene 2 sílabos por elaborar", body: message, url: "http://localhost:3000/" }],
      ["luis@ueb.edu.ec", { name: "Luis Mora", title: "Tiene un sílabo por elaborar", body: message, url: "http://localhost:3000/" }],
    ])
  })

  it("validates the process like Laravel, with exists only after the earlier rules pass", async () => {
    const missing = "El campo proceso es obligatorio."
    expect((await store({})).json).toEqual({ message: missing, errors: { process_id: [missing] } })
    expect((await store({ process_id: "abc" })).json?.errors).toEqual({ process_id: ["El campo proceso debe ser un UUID válido."] })
    expect((await store({ process_id: "cd000000-0000-4000-8000-000000000009" })).json?.errors).toEqual({ process_id: ["El valor seleccionado en proceso no es válido."] })
    expect(log).toEqual([])
  })

  it("only lets a coordinator with a career start a convocation", async () => {
    world.assignments = [makeAssignment({ role: "docente", careerId: CAREER })]
    expect((await store({ process_id: PROCESS })).text).toBe(FORBIDDEN)
    world.assignments = [makeAssignment({ role: "bibliotecario", careerId: null })]
    expect((await store({ process_id: PROCESS })).text).toBe(FORBIDDEN)
    expect(log).toEqual([])
  })

  it("rejects a process that stopped being open or a career that already has its convocation, atomically", async () => {
    process = { id: PROCESS, state: "pausado", periodId: PERIOD }
    expect((await store({ process_id: PROCESS })).json?.errors).toEqual({ process_id: ["La convocatoria institucional todavía no está abierta."] })
    process = { id: PROCESS, state: "abierto", periodId: PERIOD }
    existing = true
    expect((await store({ process_id: PROCESS })).json?.errors).toEqual({ process_id: ["Esta carrera ya tiene una convocatoria para el período institucional."] })
    expect(audits).toEqual([])
    expect(notices.notifications).toEqual([])
  })

  it("reports every missing piece of the career before opening and keeps nothing", async () => {
    blockers = ["Administración debe cargar el logo de la facultad antes de que Coordinación abra la convocatoria.", "Falta 1 paralelo sin docente."]
    expect((await store({ process_id: PROCESS })).json).toEqual({
      message: "Administración debe cargar el logo de la facultad antes de que Coordinación abra la convocatoria. (y 1 error más)",
      errors: { convocation: blockers },
    })
    blockers = []
    problem = "La sección «Datos» de la plantilla está vacía."
    expect((await store({ process_id: PROCESS })).json?.errors).toEqual({ convocation: [problem] })
    problem = null
    generation = new GenerationRejected({ convocation: ["La materia Cálculo I debe tener exactamente un docente vigente por paralelo."] })
    expect((await store({ process_id: PROCESS })).json?.errors).toEqual({ convocation: ["La materia Cálculo I debe tener exactamente un docente vigente por paralelo."] })
    expect(log.filter((entry) => entry === "commit")).toEqual([])
    expect(audits).toEqual([])
    expect(notices.mails).toEqual([])
  })
})

describe("POST /api/v1/coordination/convocations/{convocation}/reanudar", () => {
  it("resumes a paused convocation, generates the new parallels and tells its teachers", async () => {
    generation = 1
    const response = await resume()
    expect(response.text).toBe(
      phpJsonEncode({ message: "Convocatoria reanudada. Los docentes vuelven a trabajar, los paralelos nuevos ya tienen su sílabo y la malla queda protegida." }),
    )
    expect(log).toEqual(["begin", `lock:convocation:${CONVOCATION}`, `generate:${CONVOCATION}:{}`, `state:${CONVOCATION}:abierta`, "commit"])
    expect(audits.map((event) => [event.action, event.metadata])).toEqual([["convocatoria.abierta", { generated_count: 1 }]])
    const at = "20270115080000123"
    expect(notices.notifications.map((item) => [item.userId, item.key, item.title, item.message, item.resourceType])).toEqual([
      [TEACHER, `flujo:convocatoria.reanudada:${CONVOCATION}:${TEACHER}:${at}`, "Se reanudó la convocatoria", "Ya puede seguir con sus sílabos de Software.", "convocatoria"],
      [OTHER_TEACHER, `flujo:convocatoria.reanudada:${CONVOCATION}:${OTHER_TEACHER}:${at}`, "Se reanudó la convocatoria", "Ya puede seguir con sus sílabos de Software.", "convocatoria"],
    ])
    expect(notices.mails).toHaveLength(2)
  })

  it("audits without metadata when nothing new was generated", async () => {
    generation = 0
    await resume()
    expect(audits.map((event) => [event.action, event.metadata])).toEqual([["convocatoria.abierta", {}]])
  })

  it("is forbidden unless the coordinator of the career resumes a paused convocation", async () => {
    record = { ...(record as ConvocationRecord), state: "abierta" }
    expect((await resume()).text).toBe(FORBIDDEN)
    record = { ...(record as ConvocationRecord), state: "pausada" }
    world.assignments = [makeAssignment({ role: "coordinador", careerId: "c0000000-0000-4000-8000-000000000009" })]
    expect((await resume()).text).toBe(FORBIDDEN)
    expect(log).toEqual([])
  })

  it("rejects under the lock when the state changed or Administration paused the process", async () => {
    locked = { ...(locked as LockedConvocation), state: "abierta" }
    expect((await resume()).json?.errors).toEqual({ convocation: ["Solo una convocatoria pausada puede reanudarse."] })
    locked = { ...(locked as LockedConvocation), state: "pausada", processState: "pausado" }
    expect((await resume()).json?.errors).toEqual({
      convocation: ["El proceso institucional no está abierto; la convocatoria se reanudará cuando Administración lo reanude."],
    })
    locked = { ...(locked as LockedConvocation), processState: "abierto" }
    generation = new GenerationRejected({ convocation: ["No existen paralelos de la carrera."] })
    expect((await resume()).json?.errors).toEqual({ convocation: ["No existen paralelos de la carrera."] })
    expect(audits).toEqual([])
    expect(notices.notifications).toEqual([])
  })

  it("answers Laravel's model 404 for unknown convocations", async () => {
    record = null
    expect(await resume()).toMatchObject({ status: 404, text: modelNotFound("Convocation", CONVOCATION) })
    expect(await resume("abc")).toMatchObject({ status: 404, text: modelNotFound("Convocation", "abc") })
  })
})
