// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { fakeNotificationTransaction, notificationWorld, recipient, type NotificationWorld } from "../notifications/testing"
import type { ProcessRow } from "./processes"
import { deleteProcess, extendProcessDeadline, resumeProcess, type LockedSyllabusProcess, type ProcessWriteDeps } from "./processWrites"
import type { ReopenPlan, TemplateChange } from "./reopenCatchUp"

const modelNotFound = (model: string, id: string) => JSON.stringify({ message: `No query results for model [App\\Modules\\Syllabus\\Infrastructure\\Persistence\\Models\\${model}] ${id}` })

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const FORBIDDEN = JSON.stringify({ message: "No tiene permiso para hacer esto." })
const PROCESS = "cd000000-0000-4000-8000-000000000001"
const PERIOD = "ce000000-0000-4000-8000-000000000001"
const CONVOCATION = "cc000000-0000-4000-8000-000000000001"
const TEACHER = "a0000000-0000-4000-8000-0000000000aa"
const COORDINATOR = "a0000000-0000-4000-8000-0000000000cc"
const LIBRARIAN = "a0000000-0000-4000-8000-0000000000dd"
const SYLLABI = ["50000000-0000-4000-8000-000000000001", "50000000-0000-4000-8000-000000000002"]

let world: FakeWorld
let notices: NotificationWorld
let row: ProcessRow | null
let locked: LockedSyllabusProcess | null
let problem: string | null
let templateChange: TemplateChange | null
let otherInProgress: boolean
let plan: ReopenPlan
const NO_PLAN: ReopenPlan = { period: false, subjects: [], teachers: [], parallels: [], handovers: [], counts: { to_draft: 0, restarted: 0, to_coordination: 0 } }
const COUNTS = { sin_iniciar: 3, borrador: 1, en_revision: 1, correccion_solicitada: 0, aprobado: 1 }
const CHANGE: TemplateChange = { changedAt: "2026-11-23 16:10:54.932237+00", key: "2026-11-23T16:10:54.932237Z" }
let log: string[]

function deps(): ProcessWriteDeps {
  return {
    bridge: fakeDeps(world),
    find: async (id) => (row !== null && row.id === id.toLowerCase() ? row : null),
    now: () => NOW,
    nowMs: () => NOW * 1000 + 7,
    async transaction(work) {
      log.push("begin")
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
            lockOtherProcesses: async () => {
              log.push("lock:others")
            },
            anotherInProgress: async () => otherInProgress,
            templateChange: async (_id, reference) => {
              log.push(`template-change:${reference}`)
              return templateChange
            },
            syllabusCounts: async (_id, toReopen) => {
              log.push(`counts:${toReopen ? "reopen" : "open"}`)
              return COUNTS
            },
            adaptToTemplate: async (id, change) => {
              log.push(`adapt:${id}:${change.key}`)
            },
            convocationsToReopen: async () => {
              log.push("lock:closed-convocations")
              return [CONVOCATION]
            },
            reopenPlan: async (ids, id, finalized) => {
              log.push(`plan:${ids.join(",")}:${id}:${finalized}`)
              return plan
            },
            reopen: async (id) => {
              log.push(`reopen:${id}`)
              return [CONVOCATION]
            },
            applyPlan: async (_plan, ids, periodId) => {
              log.push(`apply:${ids.join(",")}:${periodId}`)
            },
            generateReopened: async (ids) => {
              log.push(`generate:${ids.join(",")}`)
            },
            openConvocations: async () => [{ id: CONVOCATION, careerLabel: "Software" }],
            extendDeadline: async (id, dueAt, extension) => {
              log.push(`deadline:${id}:${dueAt}:${extension}`)
            },
            teachersWithPendingWork: async () => [TEACHER],
            updateState: async (id, state) => {
              log.push(`state:${id}:${state}`)
            },
          }),
        )
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

describe("process binding", () => {
  it("answers Laravel's model 404 for an unknown or malformed process", async () => {
    expect(await destroy(undefined, "cd000000-0000-4000-8000-00000000ffff")).toMatchObject({ status: 404, text: modelNotFound("SyllabusProcess", "cd000000-0000-4000-8000-00000000ffff") })
    expect(await resume({}, "abc")).toMatchObject({ status: 404, text: modelNotFound("SyllabusProcess", "abc") })
  })
})

beforeEach(() => {
  world = {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "administrador", careerId: null })],
  }
  notices = notificationWorld({
    users: [recipient(TEACHER), recipient(COORDINATOR), recipient(LIBRARIAN), recipient(golden.userId)],
    periods: new Map([[`convocatoria:${CONVOCATION}`, PERIOD], [`proceso_silabos:${PROCESS}`, PERIOD]]),
  })
  row = { id: PROCESS, state: "abierto", period: "2026-2", periodId: PERIOD, periodEndsOn: "2027-03-12", startsOn: "2026-11-10", dueOn: "2026-12-10", convocationsCount: 1, extensions: 0 }
  locked = {
    id: PROCESS,
    state: "abierto",
    periodId: PERIOD,
    period: "2026-2",
    dueAt: Date.UTC(2026, 11, 11, 4, 59, 59) / 1000,
    extensions: 0,
    periodEndsOn: "2027-03-12",
    finalized: false,
  }
  problem = null
  templateChange = null
  otherInProgress = false
  plan = NO_PLAN
  log = []
})

describe("DELETE /api/v1/admin/processes/{process}", () => {
  it("erases the process with all its work and tells everyone involved except the administrator", async () => {
    const response = await destroy()
    expect(response.text).toBe(JSON.stringify({ message: "Proceso de sílabos eliminado." }))
    expect(log).toEqual(["begin", `lock:process:${PROCESS}`, "lock:convocations", "lock:syllabi", "purge:2", `delete:${PROCESS}:${CONVOCATION}`, "commit"])
    const message = "Administración eliminó el proceso de sílabos 2026-2 y todos sus sílabos."
    expect(notices.notifications).toEqual([])
    // No email of its own: the daily summary replaces it.
    expect(notices.mails).toEqual([])
  })

  it("needs no message and ignores one if sent", async () => {
    expect((await destroy({})).status).toBe(200)
    expect((await destroy({ mensaje: ["x"] })).status).toBe(200)
    expect(notices.notifications).toEqual([])
  })

  it("is forbidden for other roles and for closed processes", async () => {
    world.assignments = [makeAssignment({ role: "coordinador", careerId: "c-1" })]
    expect((await destroy()).text).toBe(FORBIDDEN)
    world.assignments = [makeAssignment({ role: "administrador", careerId: null })]
    row = { ...(row as ProcessRow), state: "cerrado" }
    expect((await destroy()).text).toBe(FORBIDDEN)
    expect(log).toEqual([])
  })

  it("leaves a process closed under the lock untouched", async () => {
    locked = { ...(locked as LockedSyllabusProcess), state: "cerrado" }
    expect((await destroy()).json?.errors).toEqual({ process: ["Un proceso de sílabos cerrado no se elimina: queda como historial."] })
    expect(log).not.toContain("purge:2")
    expect(notices.notifications).toEqual([])
  })
})

describe("POST /api/v1/admin/processes/{process}/reanudar", () => {
  beforeEach(() => {
    row = { ...(row as ProcessRow), state: "pausado" }
    locked = { ...(locked as LockedSyllabusProcess), state: "pausado" }
  })

  it("reopens the process and tells teachers, coordination and the library", async () => {
    const response = await resume()
    expect(response.text).toBe(JSON.stringify({ message: "Proceso reanudado. Los envíos vuelven a admitirse." }))
    expect(log).toEqual(["begin", `lock:process:${PROCESS}`, "template-change:pause", `state:${PROCESS}:abierto`, "commit"])
    const at = "20270115080000007"
    expect(notices.notifications).toEqual([])
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
    expect(notices.notifications).toEqual([])
  })

  it("asks to confirm when the template changed during the pause, without touching anything", async () => {
    templateChange = CHANGE
    const response = await resume()
    expect(response.status).toBe(422)
    expect(response.text).toBe(
      JSON.stringify({
        message:
          "La plantilla cambió durante la pausa. Confirme para adaptar los sílabos del período: se conserva lo escrito y los enviados o aprobados vuelven a borrador.",
        code: "plantilla_cambiada",
        counts: COUNTS,
      }),
    )
    expect(log).toEqual(["begin", `lock:process:${PROCESS}`, "template-change:pause", "counts:open", "commit"])
    expect(notices.notifications).toEqual([])
    expect((await resume({ confirmar_rehacer: "0" })).status).toBe(422)
  })

  it("adapts the syllabi to the new template when confirmed, then reopens the process", async () => {
    templateChange = CHANGE
    const response = await resume({ confirmar_rehacer: "1" })
    expect(response.text).toBe(JSON.stringify({ message: "Proceso reanudado. Los envíos vuelven a admitirse." }))
    expect(log).toEqual([
      "begin",
      `lock:process:${PROCESS}`,
      "template-change:pause",
      "counts:open",
      `adapt:${PROCESS}:${CHANGE.key}`,
      `state:${PROCESS}:abierto`,
      "commit",
    ])
  })
})

describe("POST /api/v1/admin/processes/{process}/deadline", () => {
  const extend = (body?: unknown) => send((request) => extendProcessDeadline(request, PROCESS, { ...deps(), now: () => Date.UTC(2026, 10, 18, 12) / 1000 }), `/api/v1/admin/processes/${PROCESS}/deadline`, "POST", body)

  it("moves the deadline to the end of the chosen day, counts the extension and tells teachers with pending work", async () => {
    const response = await extend({ due_at: "2026-12-20" })
    expect(response.text).toBe(JSON.stringify({ message: "Plazo prorrogado para todos los procesos de sílabos." }))
    expect(log).toEqual(["begin", `lock:process:${PROCESS}`, `deadline:${PROCESS}:2026-12-21T04:59:59+00:00:1`, "commit"])
    expect(notices.notifications).toEqual([])
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
    expect((await extend({ due_at: "2026-12-20" })).json?.errors).toEqual({ process: ["Ya se usaron las 2 prórrogas de este proceso de sílabos."] })
  })

  describe("reopening a closed process", () => {
    beforeEach(() => {
      row = { ...(row as ProcessRow), state: "cerrado" }
      locked = { ...(locked as LockedSyllabusProcess), state: "cerrado", finalized: true }
    })

    it("reopens the process, catches up the changes and generates the missing syllabi", async () => {
      const response = await extend({ due_at: "2026-12-20" })
      expect(response.text).toBe(JSON.stringify({ message: "Plazo prorrogado y proceso reabierto." }))
      expect(log).toEqual([
        "begin",
        `lock:process:${PROCESS}`,
        "lock:others",
        "template-change:reopen",
        "lock:closed-convocations",
        `plan:${CONVOCATION}:${PROCESS}:true`,
        `reopen:${PROCESS}`,
        `deadline:${PROCESS}:2026-12-21T04:59:59+00:00:1`,
        `apply:${CONVOCATION}:${PERIOD}`,
        `generate:${CONVOCATION}`,
        "commit",
      ])
      expect(notices.notifications).toEqual([])
    })

    it("asks to confirm a template change after closing and reports the pending changes too", async () => {
      templateChange = CHANGE
      plan = { ...NO_PLAN, counts: { to_draft: 2, restarted: 0, to_coordination: 1 } }
      const response = await extend({ due_at: "2026-12-20" })
      expect(response.status).toBe(422)
      expect(response.text).toBe(
        JSON.stringify({
          message:
            "La plantilla cambió después de finalizar. Confirme para adaptar los sílabos del período: se conserva lo escrito y los enviados o aprobados vuelven a borrador.",
          code: "plantilla_cambiada",
          counts: COUNTS,
          pending_counts: { to_draft: 2, restarted: 0, to_coordination: 1 },
        }),
      )
      expect(log).not.toContain(`reopen:${PROCESS}`)
    })

    it("asks to confirm the pending changes once the template change is confirmed", async () => {
      templateChange = CHANGE
      plan = { ...NO_PLAN, counts: { to_draft: 0, restarted: 3, to_coordination: 0 } }
      const response = await extend({ due_at: "2026-12-20", confirmar_rehacer: true })
      expect(response.status).toBe(422)
      expect(response.text).toBe(
        JSON.stringify({
          message:
            "Hubo cambios mientras el proceso de sílabos estuvo finalizado. Confirme para aplicarlos: hay sílabos que volverán a borrador, volverán a Coordinación o perderán su contenido.",
          code: "cambios_pendientes",
          counts: { to_draft: 0, restarted: 3, to_coordination: 0 },
        }),
      )
      const confirmed = await extend({ due_at: "2026-12-20", confirmar_rehacer: true, confirmar_cambios: "1" })
      expect(confirmed.status).toBe(200)
      expect(log).toContain(`adapt:${PROCESS}:${CHANGE.key}`)
      expect(log.indexOf(`adapt:${PROCESS}:${CHANGE.key}`)).toBeLessThan(log.lastIndexOf(`apply:${CONVOCATION}:${PERIOD}`))
    })

    it("refuses while another process is in progress", async () => {
      otherInProgress = true
      expect((await extend({ due_at: "2026-12-20" })).json?.errors).toEqual({ process: ["Hay otro proceso de sílabos en curso; finalícelo o elimínelo antes de reabrir este"] })
      otherInProgress = false
      problem = "La sección «Datos» de la plantilla está vacía."
      expect((await extend({ due_at: "2026-12-20" })).json?.errors).toEqual({
        process: ["La plantilla no está lista para usarse. Complétela; «Antes de empezar» indica qué falta."],
      })
    })
  })

  it("forbids non-administrators", async () => {
    world.assignments = [makeAssignment({ role: "coordinador", careerId: "c-1" })]
    expect((await extend({ due_at: "2026-12-20" })).text).toBe(FORBIDDEN)
  })
})
