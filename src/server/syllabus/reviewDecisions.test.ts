// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { fakeNotificationTransaction, notificationWorld, recipient, type NotificationWorld } from "../notifications/testing"
import { phpJsonEncode } from "../laravel/phpJson"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import { requestCorrection, resetSyllabus, type DecisionRevision, type DecisionSyllabus, type ReviewDecisionDeps } from "./reviewDecisions"
import type { ReviewRevision } from "./reviewDetails"
import type { DetailSyllabus } from "./syllabusDetail"

const modelNotFound = (model: string, id: string) => JSON.stringify({ message: `No query results for model [App\\Modules\\Syllabus\\Infrastructure\\Persistence\\Models\\${model}] ${id}` }, null, 4)

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'
const CAREER = "c0000000-0000-4000-8000-000000000001"
const SYLLABUS = "50000000-0000-4000-8000-000000000001"
const REVISION = "70000000-0000-4000-8000-000000000001"
const TEACHER = "a0000000-0000-4000-8000-0000000000aa"
const PAUSED = "La convocatoria de la carrera está en pausa: las revisiones se retoman cuando se reanude."
const CLOSED = "La convocatoria está cerrada: la revisión queda solo para consulta y no admite decisiones."
const FRESH = "50000000-0000-4000-8000-0000000000ff"
const REASON = "El docente cambió de materia y debe empezar otra vez."
const JUSTIFICATION = "Se requiere precisión académica antes de aprobar la revisión."

let world: FakeWorld
let forwarded: Request[]
let notices: NotificationWorld
let syllabus: DetailSyllabus
let revision: ReviewRevision | null
let locked: DecisionSyllabus | null
let lockedRevision: DecisionRevision | null
let latest: string | null
let stage: string | null
let lockedBlock: string | null
let freshBlock: string | null
let log: string[]
let audits: AuditEventInput[]

function deps(): ReviewDecisionDeps {
  return {
    bridge: fakeDeps(world, forwarded),
    store: {
      revision: async (id) => (revision !== null && revision.id === id.toLowerCase() ? revision : null),
      syllabus: async () => syllabus,
    },
    now: () => NOW,
    async transaction(work) {
      log.push("begin")
      const staged: AuditEventInput[] = []
      try {
        const result = await fakeNotificationTransaction(notices, NOW, (notifications) =>
          work({
            notifications,
            teachersFor: async () => [TEACHER],
            lockedDecisionBlock: async () => {
              log.push("lock:process+convocation")
              return lockedBlock
            },
            decisionBlock: async () => freshBlock,
            revisionCount: async () => 2,
            restartSyllabus: async (target) => {
              log.push(`restart:${target.id}:${target.convocationId}:${target.parallelId}`)
              return FRESH
            },
            lockSyllabus: async (id) => {
              log.push(`lock:syllabus:${id}`)
              return locked
            },
            latestRevisionId: async () => latest,
            lockRevision: async (id) => {
              log.push(`lock:revision:${id}`)
              return lockedRevision
            },
            revisionStage: async () => stage,
            requestCorrection: async (id, justification, requestedStage, actor, now) => {
              log.push(`correction:${id}:${requestedStage}:${actor}:${now}:${justification}`)
            },
            markCorrectionRequested: async (id, version, now) => {
              log.push(`syllabus:${id}:correccion_solicitada:${version}:${now}`)
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

async function post(body: unknown, id = REVISION) {
  const request = new Request(
    apiRequest(`/api/v1/coordination/reviews/${id}/request-correction`, {
      cookie,
      method: "POST",
      headers: { "x-csrf-token": golden.csrfToken, "content-type": "application/json" },
    }),
    { body: JSON.stringify(body) },
  )
  const response = await requestCorrection(request, id, deps())
  const text = await response.text()
  return { status: response.status, text, json: text.startsWith("{") ? (JSON.parse(text) as Record<string, unknown>) : null }
}

beforeEach(() => {
  world = {
    sessions: new Map([[golden.sessionId, { payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "coordinador", careerId: CAREER })],
  }
  forwarded = []
  notices = notificationWorld({ users: [recipient(TEACHER, { name: "Ana Pérez", email: "ana@ueb.edu.ec" })], subjects: new Map([[SYLLABUS, "Biología"]]) })
  syllabus = {
    id: SYLLABUS,
    state: "en_revision",
    careerId: CAREER,
    convocationState: "abierta",
    processState: "abierto",
    dueOn: "2026-12-01",
    currentTeacher: false,
    writtenByUser: false,
    hasLibrarySubmission: true,
    subjectId: "a0000000-0000-4000-8000-000000000001",
    convocationId: "b0000000-0000-4000-8000-000000000001",
    subject: "Biología",
    code: "C2",
    parallel: "A",
    career: "Software",
    period: "2026-2",
    startedAt: null,
    savedAt: null,
    version: 4,
    context: {},
  }
  revision = { id: REVISION, syllabusId: SYLLABUS, number: 1, submittedAt: NOW, submittedBy: "Ana Pérez", fingerprint: "x" }
  locked = { id: SYLLABUS, state: "en_revision", version: 4, convocationId: syllabus.convocationId, parallelId: "d0000000-0000-4000-8000-000000000001" }
  lockedRevision = { id: REVISION, number: 1, correctionRequested: false }
  latest = REVISION
  stage = "coordinacion"
  lockedBlock = null
  freshBlock = null
  log = []
  audits = []
})

describe("POST /api/v1/coordination/reviews/{revision}/request-correction", () => {
  it("requests the correction, bumps the draft version, audits and notifies the teacher after commit", async () => {
    const response = await post({ justification: `  ${JUSTIFICATION}  ` })
    expect(response.status).toBe(200)
    expect(response.text).toBe(phpJsonEncode({ message: "Corrección solicitada; el docente ya puede editar una nueva versión de trabajo." }))
    expect(log).toEqual([
      "begin",
      "lock:process+convocation",
      `lock:syllabus:${SYLLABUS}`,
      `lock:revision:${REVISION}`,
      `correction:${REVISION}:coordinacion:${golden.userId}:${NOW}:${JUSTIFICATION}`,
      `syllabus:${SYLLABUS}:correccion_solicitada:5:${NOW}`,
      "commit",
    ])
    expect(audits).toEqual([
      {
        actorId: golden.userId,
        roleAssignmentId: golden.roleId,
        action: "silabo.correccion_solicitada",
        resourceType: "revision_silabo",
        resourceId: REVISION,
        result: "exito",
        metadata: { revision_number: 1, from_state: "en_revision", to_state: "correccion_solicitada", stage: "coordinacion" },
        occurredAt: NOW,
      },
    ])
    expect(notices.notifications).toEqual([
      {
        userId: TEACHER,
        key: `flujo:silabo.correccion_solicitada:${REVISION}`,
        type: "silabo.correccion_solicitada",
        title: "Corrección solicitada",
        message: "Revise las observaciones del sílabo de Biología, revisión 1, corríjalo y envíelo otra vez.",
        resourceType: "silabo",
        resourceId: SYLLABUS,
        periodId: null,
        notifiedAt: NOW,
      },
    ])
    expect(notices.mails).toEqual([
      {
        mailable: "workflow",
        to: "ana@ueb.edu.ec",
        data: {
          name: "Ana Pérez",
          title: "Corrección solicitada",
          body: "Revise las observaciones del sílabo de Biología, revisión 1, corríjalo y envíelo otra vez.",
          url: "http://localhost:3000/",
        },
      },
    ])
  })

  it("validates the justification with its Spanish attribute name", async () => {
    expect((await post({ justification: "Corto" })).text).toBe(
      phpJsonEncode({ message: "El campo justificación debe tener al menos 10 caracteres.", errors: { justification: ["El campo justificación debe tener al menos 10 caracteres."] } }),
    )
    expect((await post({})).json).toEqual({ message: "El campo justificación es obligatorio.", errors: { justification: ["El campo justificación es obligatorio."] } })
    expect((await post({ justification: ["x"] })).json?.errors).toEqual({
      justification: ["El campo justificación debe ser una cadena de texto.", "El campo justificación debe tener al menos 10 caracteres."],
    })
    expect(log).toEqual([])
  })

  it("only lets the coordinator of the career decide on the coordination route", async () => {
    world.assignments = [makeAssignment({ role: "docente", careerId: CAREER })]
    expect((await post({ justification: JUSTIFICATION })).text).toBe(FORBIDDEN)
    world.assignments = [makeAssignment({ role: "bibliotecario", careerId: null })]
    expect((await post({ justification: JUSTIFICATION })).text).toBe(FORBIDDEN)
    world.assignments = [makeAssignment({ role: "coordinador", careerId: "c0000000-0000-4000-8000-000000000009" })]
    expect((await post({ justification: JUSTIFICATION })).text).toBe(FORBIDDEN)
    expect(log).toEqual([])
    expect(notices.notifications).toEqual([])
  })

  it("answers 403 with the block while the career is paused or the convocation is closed, before validating", async () => {
    syllabus = { ...syllabus, convocationState: "pausada" }
    expect(await post({ justification: "x" })).toMatchObject({ status: 403, text: phpJsonEncode({ message: PAUSED }) })
    syllabus = { ...syllabus, convocationState: "cerrada" }
    expect((await post({ justification: JUSTIFICATION })).text).toBe(phpJsonEncode({ message: CLOSED }))
    syllabus = { ...syllabus, convocationState: "abierta", processState: "pausado" }
    expect((await post({ justification: JUSTIFICATION })).json).toEqual({
      message: "Administración pausó la convocatoria institucional: las revisiones se retoman cuando se reanude.",
    })
    expect(log).toEqual([])
  })

  it("still blocks a pause that lands after authorization, under the lock", async () => {
    lockedBlock = PAUSED
    expect((await post({ justification: JUSTIFICATION })).json).toEqual({ message: PAUSED, errors: { revision: [PAUSED] } })
    expect(log.at(-1)).toBe("rollback")
    expect(audits).toEqual([])
    expect(notices.notifications).toEqual([])
    expect(notices.mails).toEqual([])
  })

  it("rejects a revision that is no longer the latest one in review, already corrected, or in another stage", async () => {
    latest = "70000000-0000-4000-8000-000000000002"
    expect((await post({ justification: JUSTIFICATION })).json?.errors).toEqual({ revision: ["La revisión dejó de estar disponible para solicitar corrección."] })
    latest = REVISION
    locked = { ...(locked as DecisionSyllabus), state: "correccion_solicitada" }
    expect((await post({ justification: JUSTIFICATION })).json?.errors).toEqual({ revision: ["La revisión dejó de estar disponible para solicitar corrección."] })
    locked = { ...(locked as DecisionSyllabus), state: "en_revision" }
    lockedRevision = { ...(lockedRevision as DecisionRevision), correctionRequested: true }
    expect((await post({ justification: JUSTIFICATION })).json?.errors).toEqual({ revision: ["Esta revisión ya tiene una solicitud de corrección."] })
    lockedRevision = { ...(lockedRevision as DecisionRevision), correctionRequested: false }
    stage = "biblioteca"
    expect((await post({ justification: JUSTIFICATION })).json?.errors).toEqual({ revision: ["La revisión no está en su etapa; otro revisor la tiene ahora."] })
    expect(audits).toEqual([])
    expect(notices.mails).toEqual([])
  })

  it("answers Laravel's model 404 for unknown or non-UUID revisions", async () => {
    revision = null
    expect(await post({ justification: JUSTIFICATION })).toMatchObject({ status: 404, text: modelNotFound("SyllabusRevision", REVISION) })
    expect(await post({ justification: JUSTIFICATION }, "abc")).toMatchObject({ status: 404, text: modelNotFound("SyllabusRevision", "abc") })
    expect(forwarded).toHaveLength(0)
  })
})

async function reset(body: unknown, id = SYLLABUS) {
  const request = new Request(
    apiRequest(`/api/v1/coordination/syllabi/${id}/reset`, {
      cookie,
      method: "POST",
      headers: { "x-csrf-token": golden.csrfToken, "content-type": "application/json" },
    }),
    { body: JSON.stringify(body) },
  )
  const response = await resetSyllabus(request, id, deps())
  const text = await response.text()
  return { status: response.status, text, json: text.startsWith("{") ? (JSON.parse(text) as Record<string, unknown>) : null }
}

describe("POST /api/v1/coordination/syllabi/{syllabus}/reset", () => {
  beforeEach(() => {
    syllabus = { ...syllabus, state: "aprobado" }
    locked = { ...(locked as DecisionSyllabus), state: "aprobado" }
    notices.subjects.set(FRESH, "Biología")
  })

  it("restarts an approved syllabus with all its history, audits it on the fresh one and notifies the teacher", async () => {
    const response = await reset({ reason: `  ${REASON}  ` })
    expect(response.status).toBe(200)
    expect(response.text).toBe(phpJsonEncode({ message: "Sílabo reiniciado con todo su historial. El docente empieza de cero con la malla y la plantilla actuales." }))
    expect(log).toEqual(["begin", `lock:syllabus:${SYLLABUS}`, `restart:${SYLLABUS}:${syllabus.convocationId}:d0000000-0000-4000-8000-000000000001`, "commit"])
    expect(audits).toEqual([
      {
        actorId: golden.userId,
        roleAssignmentId: golden.roleId,
        action: "silabo.eliminado",
        resourceType: "silabo",
        resourceId: FRESH,
        result: "exito",
        metadata: { previous_syllabus_id: SYLLABUS, paralelo_id: "d0000000-0000-4000-8000-000000000001", revisions: 2, reason: REASON },
        occurredAt: NOW,
      },
    ])
    const message = `Coordinación eliminó el sílabo aprobado de Biología; elabórelo con la malla y la plantilla actuales. Motivo: ${REASON}`
    expect(notices.notifications).toMatchObject([
      { userId: TEACHER, key: `flujo:silabo.eliminado:${FRESH}`, type: "silabo.eliminado", title: "Su sílabo volvió a empezar", message, resourceType: "silabo", resourceId: FRESH },
    ])
    expect(notices.mails).toEqual([
      { mailable: "workflow", to: "ana@ueb.edu.ec", data: { name: "Ana Pérez", title: "Su sílabo volvió a empezar", body: message, url: "http://localhost:3000/" } },
    ])
  })

  it("validates the reason as «motivo»", async () => {
    expect((await reset({})).json).toEqual({ message: "El campo motivo es obligatorio.", errors: { reason: ["El campo motivo es obligatorio."] } })
    expect((await reset({ reason: "no" })).json?.errors).toEqual({ reason: ["El campo motivo debe tener al menos 5 caracteres."] })
    expect((await reset({ reason: "x".repeat(501) })).json?.errors).toEqual({ reason: ["El campo motivo no debe tener más de 500 caracteres."] })
    expect(log).toEqual([])
  })

  it("only lets the coordinator of the career reset an approved syllabus", async () => {
    world.assignments = [makeAssignment({ role: "docente", careerId: CAREER })]
    expect((await reset({ reason: REASON })).text).toBe(FORBIDDEN)
    world.assignments = [makeAssignment({ role: "coordinador", careerId: "c0000000-0000-4000-8000-000000000009" })]
    expect((await reset({ reason: REASON })).text).toBe(FORBIDDEN)
    world.assignments = [makeAssignment({ role: "coordinador", careerId: CAREER })]
    syllabus = { ...syllabus, state: "en_revision" }
    expect((await reset({ reason: "no" })).text).toBe(FORBIDDEN)
    expect(log).toEqual([])
  })

  it("answers 403 with the block while paused or closed, before validating", async () => {
    syllabus = { ...syllabus, convocationState: "pausada" }
    expect((await reset({ reason: "no" })).text).toBe(phpJsonEncode({ message: PAUSED }))
    syllabus = { ...syllabus, convocationState: "cerrada" }
    expect((await reset({ reason: REASON })).text).toBe(phpJsonEncode({ message: CLOSED }))
    expect(log).toEqual([])
  })

  it("rejects inside the transaction when the syllabus stopped being approved or got blocked", async () => {
    locked = { ...(locked as DecisionSyllabus), state: "borrador" }
    expect((await reset({ reason: REASON })).json).toEqual({ message: "Solo se reinicia un sílabo aprobado.", errors: { syllabus: ["Solo se reinicia un sílabo aprobado."] } })
    locked = { ...(locked as DecisionSyllabus), state: "aprobado" }
    freshBlock = PAUSED
    expect((await reset({ reason: REASON })).json?.errors).toEqual({ syllabus: [PAUSED] })
    expect(log.filter((entry) => entry.startsWith("restart"))).toEqual([])
    expect(audits).toEqual([])
    expect(notices.mails).toEqual([])
  })

  it("answers Laravel's model 404 for unknown or non-UUID syllabi", async () => {
    expect(await reset({ reason: REASON }, "abc")).toMatchObject({ status: 404, text: modelNotFound("Syllabus", "abc") })
    expect(forwarded).toHaveLength(0)
  })
})
