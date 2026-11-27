// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../http/__fixtures__/laravel-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { fakeNotificationTransaction, notificationWorld, recipient, type NotificationWorld } from "../notifications/testing"
import { SignatureRejected } from "../signatures/cmsVerifier"
import type { SignatureRow } from "../signatures/signDecision"
import type { ReviewRevision } from "../syllabus/reviewDetails"
import type { DetailSyllabus } from "../syllabus/syllabusDetail"
import { commentLibraryReview, verifyLibraryReview, type LibraryDecisionDeps } from "./reviewDecisions"

const modelNotFound = (model: string, id: string) => JSON.stringify({ message: `No query results for model [App\\Modules\\Syllabus\\Infrastructure\\Persistence\\Models\\${model}] ${id}` })

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'
const ABORTED = '{"message":""}'
const CAREER = "c0000000-0000-4000-8000-000000000001"
const SYLLABUS = "01a2094b-56da-719b-a847-c1c9a1aa0584"
const REVISION = "70000000-0000-4000-8000-000000000001"
const SUBMISSION = "e0000000-0000-4000-8000-000000000001"
const COORDINATOR = "c1000000-0000-4000-8000-000000000001"
const TEACHER = "a1000000-0000-4000-8000-000000000001"
const FINGERPRINT = "cd".repeat(32)
const STATEMENT = `silabos-ueb|silabo:${SYLLABUS}|accion:aprobacion_biblioteca|huella:${FINGERPRINT}`
const PAUSED = "El proceso de sílabos de la carrera está en pausa: las revisiones se retoman cuando se reanude."
const CLOSED = "El proceso de sílabos está cerrado: la revisión queda solo para consulta y no admite decisiones."

let world: FakeWorld
let notices: NotificationWorld
let syllabus: DetailSyllabus
let revision: ReviewRevision | null
let lockedBlock: string | null
let locked: { id: string; state: string; version: number; convocationId: string; parallelId: string } | null
let submission: { id: string; verified: boolean } | null
let latest: string | null
let stage: string | null
let lockedRevision: { id: string; number: number; correctionRequested: boolean } | null
let signedRoles: string[]
let log: string[]
let stored: SignatureRow[]

function deps(): LibraryDecisionDeps {
  return {
    bridge: fakeDeps(world),
    store: {
      revision: async (id) => (revision !== null && revision.id === id ? revision : null),
      syllabus: async () => syllabus,
      userName: async () => "Rosa Elena Yánez Campos",
    },
    settings: () => ({ trustedBundle: null, production: false, now: () => NOW, requireHolderMatch: true }),
    verify: async (content, cms) => {
      if (cms !== "firma-valida") throw new SignatureRejected("La firma no corresponde a la declaración.")
      log.push(`verify:${content}`)
      return { holder: "ROSA ELENA YÁNEZ CAMPOS", serial: "0A", issuer: "C=EC, CN=AUTORIDAD", validTo: NOW + 1000 }
    },
    now: () => NOW,
    async transaction(work) {
      log.push("begin")
      const staged = { stored: [] as SignatureRow[] }
      const result = await fakeNotificationTransaction(notices, NOW, (notifications) =>
        work({
          notifications,
          coordinatorsForCareer: async (careerId) => (careerId === CAREER ? [COORDINATOR] : []),
          teachersFor: async () => [TEACHER],
          lockedDecisionBlock: async () => {
            log.push("lock:process+convocation")
            return lockedBlock
          },
          lockSyllabus: async (id) => {
            log.push(`lock:syllabus:${id}`)
            return locked
          },
          lockSubmission: async (id) => {
            log.push(`lock:submission:${id}`)
            return submission
          },
          latestRevisionId: async () => latest,
          revisionStage: async () => stage,
          markVerified: async (id, actor, now) => void log.push(`verified:${id}:${actor}:${now}`),
          lockRevision: async (id) => {
            log.push(`lock:revision:${id}`)
            return lockedRevision
          },
          requestCorrection: async (id, justification, requested, actor, now) => void log.push(`correction:${id}:${requested}:${actor}:${now}:${justification}`),
          markCorrectionRequested: async (id, version, now) => void log.push(`syllabus:${id}:correccion_solicitada:${version}:${now}`),
          signed: async (_id, role) => signedRoles.includes(role),
          insertSignature: async (row) => {
            staged.stored.push(row)
            return "f0000000-0000-4000-8000-000000000001"
          },
        }),
      )
      stored.push(...staged.stored)
      log.push("commit")
      return result
    },
  }
}

async function post(handler: typeof verifyLibraryReview, suffix: string, body: unknown, id = REVISION) {
  const request = new Request(
    apiRequest(`/api/v1/library/reviews/${id}/${suffix}`, { cookie, method: "POST", headers: { "x-csrf-token": golden.csrfToken, "content-type": "application/json" } }),
    { body: JSON.stringify(body) },
  )
  const response = await handler(request, id, deps())
  const text = await response.text()
  return { status: response.status, text, json: text.startsWith("{") ? (JSON.parse(text) as Record<string, unknown>) : null }
}

const verify = (body: unknown, id?: string) => post(verifyLibraryReview, "verify", body, id)
const comment = (body: unknown, id?: string) => post(commentLibraryReview, "comments", body, id)

beforeEach(() => {
  world = {
    sessions: new Map([[golden.sessionId, { id: golden.sessionId, userId: golden.userId, payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ role: "bibliotecario", careerId: null, careerLabel: null })],
  }
  notices = notificationWorld({ users: [recipient(COORDINATOR), recipient(TEACHER)], subjects: new Map([[SYLLABUS, "Biología"]]) })
  syllabus = {
    id: SYLLABUS,
    state: "en_revision",
    careerId: CAREER,
    convocationState: "abierto",
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
    version: 8,
    context: [],
  }
  revision = { id: REVISION, syllabusId: SYLLABUS, number: 2, submittedAt: NOW - 100, submittedBy: "Ana", fingerprint: FINGERPRINT }
  lockedBlock = null
  locked = { id: SYLLABUS, state: "en_revision", version: 8, convocationId: syllabus.convocationId, parallelId: "p" }
  submission = { id: SUBMISSION, verified: false }
  latest = REVISION
  stage = "biblioteca"
  lockedRevision = { id: REVISION, number: 2, correctionRequested: false }
  signedRoles = []
  log = []
  stored = []
})

describe("POST library/reviews/{r}/verify", () => {
  it("signs, records the verification and tells coordination", async () => {
    expect(await verify({ signature: { statement: STATEMENT, cms: "firma-valida" } })).toMatchObject({ status: 201, json: { message: "Sílabo firmado y enviado a coordinación." } })
    expect(log).toEqual([
      "begin",
      "lock:process+convocation",
      `lock:syllabus:${SYLLABUS}`,
      `lock:submission:${REVISION}`,
      `verify:${STATEMENT}`,
      `verified:${SUBMISSION}:${golden.userId}:${NOW}`,
      "commit",
    ])
    expect(stored.map((row) => [row.role, row.holder, row.revisionId])).toEqual([["biblioteca", "ROSA ELENA YÁNEZ CAMPOS", REVISION]])
    expect(notices.notifications).toEqual([])
  })

  it("only lets an active librarian decide, before reading the signature", async () => {
    world.assignments = [makeAssignment({ role: "coordinador", careerId: CAREER })]
    expect((await verify({})).text).toBe(FORBIDDEN)
    world.assignments = [makeAssignment({ role: "bibliotecario", careerId: null, careerLabel: null })]
    expect((await verify({ signature: "texto" })).json).toMatchObject({ errors: { signature: ["El campo firma electrónica debe ser una lista."] } })
    expect((await verify({ signature: { cms: "x" } })).json).toEqual({ message: "La firma no es válida.", errors: { signature: ["La firma no es válida."] } })
    syllabus = { ...syllabus, convocationState: "cerrado" }
    expect(await verify({ signature: { statement: STATEMENT, cms: "firma-valida" } })).toMatchObject({ status: 403, text: ABORTED })
    syllabus = { ...syllabus, convocationState: "abierto", hasLibrarySubmission: false }
    expect((await verify({})).text).toBe(ABORTED)
    expect(log).toEqual([])
  })

  it("does nothing more when the library already verified the revision", async () => {
    submission = { id: SUBMISSION, verified: true }
    expect((await verify({})).status).toBe(201)
  })

  it("refuses revisions that no longer wait for the library and decisions blocked under the lock", async () => {
    stage = "coordinacion"
    expect((await verify({})).json).toEqual({ message: "Este sílabo ya no espera la revisión de biblioteca.", errors: { revision: ["Este sílabo ya no espera la revisión de biblioteca."] } })
    stage = "biblioteca"
    latest = "70000000-0000-4000-8000-000000000002"
    expect((await verify({})).json).toMatchObject({ errors: { revision: ["Este sílabo ya no espera la revisión de biblioteca."] } })
    latest = REVISION
    lockedBlock = PAUSED
    expect((await verify({})).json).toEqual({ message: PAUSED, errors: { revision: [PAUSED] } })
    lockedBlock = null
    expect((await verify({})).json).toEqual({ message: "Firme con su firma electrónica.", errors: { signature: ["Firme con su firma electrónica."] } })
  })

  it("answers Laravel's model 404 for unknown revisions", async () => {
    revision = null
    expect(await verify({})).toMatchObject({ status: 404, text: modelNotFound("SyllabusRevision", REVISION) })
  })
})

describe("POST library/reviews/{r}/comments", () => {
  it("returns the syllabus to the teacher with the chosen reasons", async () => {
    const response = await comment({ reasons: ["codigo_incorrecto", "otro"], other: "  Falta la 3.ª edición de Pressman. " })
    expect(response).toMatchObject({ status: 201, json: { message: "Comentario enviado. El docente corregirá el sílabo y lo reenviará; volverá a biblioteca." } })
    expect(log).toEqual([
      "begin",
      "lock:process+convocation",
      `lock:syllabus:${SYLLABUS}`,
      `lock:revision:${REVISION}`,
      `correction:${REVISION}:biblioteca:${golden.userId}:${NOW}:El código del libro es incorrecto; Falta la 3.ª edición de Pressman.`,
      `syllabus:${SYLLABUS}:correccion_solicitada:9:${NOW}`,
      "commit",
    ])
    expect(notices.notifications.map((row) => [row.userId, row.key])).toEqual([[TEACHER, `flujo:silabo.correccion_solicitada:${REVISION}`]])
  })

  it("validates the reasons with the Laravel messages", async () => {
    expect((await comment({})).json).toEqual({ message: "Elija al menos un motivo.", errors: { reasons: ["Elija al menos un motivo."] } })
    expect((await comment({ reasons: [] })).json).toEqual({ message: "Elija al menos un motivo.", errors: { reasons: ["Elija al menos un motivo."] } })
    expect((await comment({ reasons: ["otro"] })).json).toEqual({ message: "Escriba el otro motivo.", errors: { other: ["Escriba el otro motivo."] } })
    expect((await comment({ reasons: ["otro"], other: "abc" })).json).toEqual({
      message: "Escriba el otro motivo con al menos 5 caracteres.",
      errors: { other: ["Escriba el otro motivo con al menos 5 caracteres."] },
    })
    expect((await comment({ reasons: ["nada", "isbn_incorrecto", "isbn_incorrecto"] })).json).toEqual({
      message: "El motivo elegido no es válido. (y 2 errores más)",
      errors: { "reasons.0": ["El motivo elegido no es válido."], "reasons.1": ["El campo motivo tiene un valor duplicado."], "reasons.2": ["El campo motivo tiene un valor duplicado."] },
    })
    expect(log).toEqual([])
  })

  it("explains why a closed or paused convocation cannot be returned and who may not decide", async () => {
    syllabus = { ...syllabus, convocationState: "cerrado" }
    expect(await comment({ reasons: ["codigo_incorrecto"] })).toMatchObject({ status: 403, json: { message: CLOSED } })
    syllabus = { ...syllabus, convocationState: "abierto", hasLibrarySubmission: false }
    expect((await comment({ reasons: ["codigo_incorrecto"] })).text).toBe(FORBIDDEN)
    syllabus = { ...syllabus, hasLibrarySubmission: true }
    lockedBlock = PAUSED
    expect((await comment({ reasons: ["codigo_incorrecto"] })).json).toEqual({ message: PAUSED, errors: { revision: [PAUSED] } })
  })

  it("refuses a revision that already left the library or already has a correction", async () => {
    stage = "coordinacion"
    expect((await comment({ reasons: ["codigo_incorrecto"] })).json).toMatchObject({ errors: { revision: ["La revisión no está en su etapa; otro revisor la tiene ahora."] } })
    stage = "biblioteca"
    lockedRevision = { id: REVISION, number: 2, correctionRequested: true }
    expect((await comment({ reasons: ["codigo_incorrecto"] })).json).toMatchObject({ errors: { revision: ["Esta revisión ya tiene una solicitud de corrección."] } })
    locked = { ...locked!, state: "aprobado" }
    expect((await comment({ reasons: ["codigo_incorrecto"] })).json).toMatchObject({ errors: { revision: ["La revisión dejó de estar disponible para solicitar corrección."] } })
  })
})
