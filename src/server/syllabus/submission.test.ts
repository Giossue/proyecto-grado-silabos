// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import golden from "../laravel/__fixtures__/laravel-golden.json"
import signatures from "../signatures/__fixtures__/laravel-signatures-golden.json"
import { apiRequest, fakeDeps, loggedInAttributes, makeAssignment, makeUser, NOW, sessionCookie, sessionPayload, type FakeWorld } from "../auth/testing"
import { fakeNotificationTransaction, notificationWorld, recipient, type NotificationWorld } from "../notifications/testing"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import { canonicalHash } from "../documents/canonicalJson"
import type { SignatureRow } from "../signatures/signDecision"
import { NeedsLaravel } from "./snapshotDocuments"
import type { DetailSyllabus } from "./syllabusDetail"
import { submissionStatement, submitSyllabus, type LibrarySubmissionRow, type RevisionRow, type SubmissionDeps, type SubmissionSchedule } from "./submission"

const cookie = `${golden.cookieName}=${encodeURIComponent(sessionCookie(golden.sessionId))}`
const FORBIDDEN = '{"message":"No tiene permiso para hacer esto."}'
const CAREER = "c0000000-0000-4000-8000-000000000001"
const SYLLABUS = "01a2094b-56da-719b-a847-c1c9a1aa0584"
const KEY = "0b000000-0000-4000-8000-000000000001"
const PREVIOUS = "70000000-0000-4000-8000-000000000001"
const NEW_ID = "70000000-0000-4000-8000-0000000000ff"
const LIBRARIAN = "b1000000-0000-4000-8000-000000000001"
const VERIFIER = "b1000000-0000-4000-8000-000000000002"
const SNAPSHOT = { schema_version: 9, template_definition: { library_sections: ["bibliografia"] }, sections: [{ key: "bibliografia", fields: [{ key: "basica", quien_llena: "docente", value: "Libro" }] }] }
const FINGERPRINT = canonicalHash(SNAPSHOT)

let world: FakeWorld
let forwarded: Request[]
let notices: NotificationWorld
let syllabus: DetailSyllabus | null
let schedule: SubmissionSchedule
let keyed: { id: string; number: number; submittedBy: string } | null
let signedRoles: string[]
let snapshot: () => Record<string, unknown>
let blocking: number | null
let locked: { id: string; state: string; version: number } | null
let latest: { id: string; number: number; correctionStage: string | null } | null
let verification: { verifiedBy: string; verifiedAt: number; snapshot: unknown } | null
let today: string
let log: string[]
let revisions: RevisionRow[]
let submissions: LibrarySubmissionRow[]
let stored: SignatureRow[]
let audits: AuditEventInput[]

function deps(): SubmissionDeps {
  return {
    bridge: fakeDeps(world, forwarded),
    store: {
      syllabus: async (id) => (syllabus !== null && syllabus.id === id ? syllabus : null),
      schedule: async () => schedule,
      revisionByKey: async (_id, key) => (key === KEY ? keyed : null),
      signed: async (_id, role) => signedRoles.includes(role),
      snapshot: async () => snapshot(),
      userName: async () => "Ana María Pérez López",
      async transaction(work) {
        log.push("begin")
        const staged = { revisions: [] as RevisionRow[], submissions: [] as LibrarySubmissionRow[], stored: [] as SignatureRow[], audits: [] as AuditEventInput[] }
        const result = await fakeNotificationTransaction(notices, NOW, (notifications) =>
          work({
            notifications,
            librarians: async () => [LIBRARIAN],
            lockSyllabus: async (id) => {
              log.push(`lock:${id}`)
              return locked
            },
            revisionByKey: async (_id, key) => (key === KEY ? keyed : null),
            lockLatestRevision: async () => latest,
            snapshot: async () => snapshot(),
            createRevision: async (row) => void staged.revisions.push(row),
            lastVerification: async () => verification,
            createLibrarySubmission: async (row) => void staged.submissions.push(row),
            markSubmitted: async (id, version, now) => void log.push(`submitted:${id}:${version}:${now}`),
            signed: async (_id, role) => signedRoles.includes(role),
            insertSignature: async (row) => {
              staged.stored.push(row)
              return "f0000000-0000-4000-8000-000000000001"
            },
            recordAudit: async (event) => void staged.audits.push(event),
          }),
        )
        revisions.push(...staged.revisions)
        submissions.push(...staged.submissions)
        stored.push(...staged.stored)
        audits.push(...staged.audits)
        log.push("commit")
        return result
      },
    },
    validate: async () => {
      log.push("validate")
      return blocking
    },
    payload: async (_request, _session, id) => ({ id, state: "en_revision" }),
    settings: () => ({ trustedBundle: null, production: false, now: () => signatures.now, requireHolderMatch: true }),
    today: () => today,
    now: () => NOW,
    newId: () => NEW_ID,
  }
}

const draft = (overrides: Partial<DetailSyllabus> = {}): DetailSyllabus => ({
  id: SYLLABUS,
  state: "borrador",
  careerId: CAREER,
  convocationState: "abierta",
  processState: "abierto",
  dueOn: "2026-12-01",
  currentTeacher: true,
  writtenByUser: true,
  hasLibrarySubmission: false,
  subjectId: "a0000000-0000-4000-8000-000000000001",
  convocationId: "b0000000-0000-4000-8000-000000000001",
  subject: "Biología",
  code: "C2",
  parallel: "A",
  career: "Software",
  period: "2026-2",
  startedAt: null,
  savedAt: null,
  version: 7,
  context: [],
  ...overrides,
})

async function call(handler: typeof submitSyllabus, suffix: string, body: unknown) {
  const request = new Request(
    apiRequest(`/api/v1/teacher/syllabi/${SYLLABUS}/${suffix}`, { cookie, method: "POST", headers: { "x-csrf-token": golden.csrfToken, "content-type": "application/json" } }),
    { body: JSON.stringify(body) },
  )
  const response = await handler(request, SYLLABUS, deps())
  const text = await response.text()
  return { status: response.status, text, json: text.startsWith("{") ? (JSON.parse(text) as Record<string, unknown>) : null }
}

const statementOf = (body: unknown) => call(submissionStatement, "signing-statement", body)
const submit = (body: unknown) => call(submitSyllabus, "submit", body)
const teacherStatement = `silabos-ueb|silabo:${SYLLABUS}|accion:envio_docente|huella:${FINGERPRINT}`

beforeEach(() => {
  forwarded = []
  world = {
    sessions: new Map([[golden.sessionId, { id: golden.sessionId, userId: golden.userId, payload: sessionPayload(loggedInAttributes()), lastActivity: NOW }]]),
    users: [makeUser()],
    assignments: [makeAssignment({ careerId: CAREER })],
  }
  notices = notificationWorld({ users: [recipient(LIBRARIAN)], subjects: new Map([[SYLLABUS, "Biología"]]) })
  syllabus = draft()
  schedule = { convocationState: "abierta", processState: "abierto", startsOn: "2026-11-01", dueOn: "2026-12-01" }
  keyed = null
  signedRoles = []
  snapshot = () => structuredClone(SNAPSHOT)
  blocking = 0
  locked = { id: SYLLABUS, state: "borrador", version: 7 }
  latest = null
  verification = null
  today = "2026-11-23"
  log = []
  revisions = []
  submissions = []
  stored = []
  audits = []
})

describe("POST teacher/syllabi/{s}/signing-statement", () => {
  it("returns the statement over the snapshot fingerprint and whether the teacher still has to sign", async () => {
    expect(await statementOf({ version_bloqueo: 7 })).toEqual({ status: 200, text: JSON.stringify({ statement: teacherStatement, required: true }), json: expect.anything() })
    signedRoles = ["docente"]
    expect((await statementOf({ version_bloqueo: 7 })).json).toEqual({ statement: teacherStatement, required: false })
  })

  it("only lets the current teacher of a running convocation ask for it", async () => {
    world.assignments = [makeAssignment({ careerId: "c0000000-0000-4000-8000-000000000099" })]
    expect((await statementOf({ version_bloqueo: 7 })).text).toBe(FORBIDDEN)
    world.assignments = [makeAssignment({ careerId: CAREER })]
    syllabus = draft({ currentTeacher: false })
    expect((await statementOf({ version_bloqueo: 7 })).status).toBe(403)
    syllabus = draft({ convocationState: "pausada" })
    expect((await statementOf({ version_bloqueo: 7 })).status).toBe(403)
    syllabus = draft({ state: "aprobado" })
    expect((await statementOf({ version_bloqueo: 7 })).status).toBe(403)
  })

  it("validates the lock version, the state, the calendar and the version like Laravel", async () => {
    expect((await statementOf({})).json).toEqual({ message: "El campo versión de edición es obligatorio.", errors: { version_bloqueo: ["El campo versión de edición es obligatorio."] } })
    syllabus = draft({ state: "en_revision" })
    expect((await statementOf({ version_bloqueo: 7 })).json).toEqual({ message: "El expediente no está listo para envío.", errors: { syllabus: ["El expediente no está listo para envío."] } })
    syllabus = draft()
    schedule = { ...schedule, startsOn: "2026-11-30" }
    expect((await statementOf({ version_bloqueo: 7 })).json).toMatchObject({ errors: { deadline: ["La convocatoria todavía no inicia; podrá enviar a partir del 30/11/2026."] } })
    schedule = { ...schedule, startsOn: "2026-11-01", dueOn: "2026-11-20" }
    expect((await statementOf({ version_bloqueo: 7 })).json).toMatchObject({ errors: { deadline: ["El plazo de entrega venció el 20/11/2026. Pida una prórroga a Administración."] } })
    schedule = { ...schedule, dueOn: "2026-12-01" }
    const conflict = await statementOf({ version_bloqueo: 6 })
    expect(conflict.status).toBe(409)
    expect(conflict.json).toEqual({ message: "El borrador cambió en otra sesión. Recarga antes de continuar.", code: "conflicto_version_borrador", version_bloqueo_actual: 7 })
  })

  it("hands the request to Laravel when the snapshot cannot be built here", async () => {
    snapshot = () => {
      throw new NeedsLaravel()
    }
    expect((await statementOf({ version_bloqueo: 7 })).status).toBe(299)
    expect(forwarded).toHaveLength(1)
  })
})

describe("POST teacher/syllabi/{s}/submit", () => {
  const signature = () => ({ statement: teacherStatement, cms: "firma" })

  it("rejects people who cannot submit and malformed requests before anything else", async () => {
    syllabus = draft({ currentTeacher: false })
    expect((await submit({ version_bloqueo: 7, idempotency_key: KEY })).text).toBe(FORBIDDEN)
    syllabus = draft()
    expect((await submit({ version_bloqueo: "x", idempotency_key: "nope" })).json).toEqual({
      message: "El campo versión de edición debe ser un número entero. (y 1 error más)",
      errors: { version_bloqueo: ["El campo versión de edición debe ser un número entero."], idempotency_key: ["El campo identificador de la solicitud debe ser un UUID válido."] },
    })
    expect((await submit({ version_bloqueo: 7, idempotency_key: KEY, signature: "texto" })).json).toMatchObject({ errors: { signature: ["El campo firma electrónica debe ser una lista."] } })
    expect((await submit({ version_bloqueo: 7, idempotency_key: KEY, signature: { statement: "x" } })).json).toEqual({ message: "La firma no es válida.", errors: { signature: ["La firma no es válida."] } })
    expect(log).toEqual([])
  })

  it("replays the revision already sent with the same key without writing again", async () => {
    keyed = { id: PREVIOUS, number: 3, submittedBy: golden.userId }
    syllabus = draft({ state: "en_revision" })
    expect((await submit({ version_bloqueo: 1, idempotency_key: KEY })).json).toEqual({ message: "Revisión 3 enviada.", syllabus: { id: SYLLABUS, state: "en_revision" } })
    expect(log).toEqual([])
    keyed = { id: PREVIOUS, number: 3, submittedBy: "someone-else" }
    expect(await submit({ version_bloqueo: 1, idempotency_key: KEY })).toMatchObject({ status: 403, text: '{\n    "message": ""\n}' })
  })

  it("stops when the validation still has blocking errors", async () => {
    blocking = 2
    expect((await submit({ version_bloqueo: 7, idempotency_key: KEY, signature: signature() })).json).toEqual({
      message: "Corrija los errores determinísticos antes de enviar.",
      errors: { validation: ["Corrija los errores determinísticos antes de enviar."] },
    })
    expect(log).toEqual(["validate"])
  })

  it("asks for the signature on the first submission and rolls everything back", async () => {
    expect((await submit({ version_bloqueo: 7, idempotency_key: KEY })).json).toEqual({ message: "Firme con su firma electrónica.", errors: { signature: ["Firme con su firma electrónica."] } })
    expect(revisions).toEqual([])
    expect(log).toEqual(["validate", "begin", `lock:${SYLLABUS}`])
  })

  it("rejects a signature that does not verify", async () => {
    const response = await submit({ version_bloqueo: 7, idempotency_key: KEY, signature: signature() })
    expect(response.json).toEqual({ message: "La firma no es válida.", errors: { signature: ["La firma no es válida."] } })
    expect(revisions).toEqual([])
  })

  it("sends the first revision: snapshot, fingerprint, signature, library submission, state, audit and notice", async () => {
    signedRoles = ["docente"]
    const response = await submit({ version_bloqueo: 7, idempotency_key: KEY })
    expect(response).toMatchObject({ status: 200, json: { message: "Revisión 1 enviada.", syllabus: { id: SYLLABUS, state: "en_revision" } } })
    expect(revisions).toEqual([{ id: NEW_ID, syllabusId: SYLLABUS, previousId: null, number: 1, key: KEY, version: 7, snapshot: SNAPSHOT, fingerprint: FINGERPRINT, submittedBy: golden.userId, submittedAt: NOW }])
    expect(submissions).toEqual([{ revisionId: NEW_ID, verifiedBy: null, verifiedAt: null, inherited: false }])
    expect(log).toEqual(["validate", "begin", `lock:${SYLLABUS}`, `submitted:${SYLLABUS}:8:${NOW}`, "commit"])
    expect(audits).toEqual([
      {
        actorId: golden.userId,
        roleAssignmentId: golden.roleId,
        action: "silabo.enviado",
        resourceType: "revision_silabo",
        resourceId: NEW_ID,
        result: "exito",
        metadata: { revision_number: 1, from_state: "borrador", to_state: "en_revision", fingerprint: FINGERPRINT },
        occurredAt: NOW,
      },
    ])
    expect(notices.notifications.map((row) => [row.userId, row.key, row.title])).toEqual([[LIBRARIAN, `flujo:silabo.enviado:${NEW_ID}`, "Sílabo enviado"]])
  })

  it("carries the library verification when coordination returned it and the bibliography did not change", async () => {
    signedRoles = ["docente"]
    syllabus = draft({ state: "correccion_solicitada" })
    locked = { id: SYLLABUS, state: "correccion_solicitada", version: 7 }
    latest = { id: PREVIOUS, number: 2, correctionStage: "coordinacion" }
    verification = { verifiedBy: VERIFIER, verifiedAt: NOW - 100, snapshot: structuredClone(SNAPSHOT) }
    await submit({ version_bloqueo: 7, idempotency_key: KEY })
    expect(revisions[0]).toMatchObject({ previousId: PREVIOUS, number: 3 })
    expect(submissions).toEqual([{ revisionId: NEW_ID, verifiedBy: VERIFIER, verifiedAt: NOW - 100, inherited: true }])
    expect(audits.map((event) => [event.action, event.metadata.from_state])).toEqual([["silabo.reenviado", "correccion_solicitada"]])
    expect(notices.notifications).toEqual([])
  })

  it("goes back to the library when the bibliography changed or the library asked for the correction", async () => {
    signedRoles = ["docente"]
    syllabus = draft({ state: "correccion_solicitada" })
    locked = { id: SYLLABUS, state: "correccion_solicitada", version: 7 }
    latest = { id: PREVIOUS, number: 2, correctionStage: "coordinacion" }
    verification = { verifiedBy: VERIFIER, verifiedAt: NOW - 100, snapshot: { ...SNAPSHOT, sections: [{ key: "bibliografia", fields: [{ key: "basica", quien_llena: "docente", value: "Otro" }] }] } }
    await submit({ version_bloqueo: 7, idempotency_key: KEY })
    expect(submissions[0]).toMatchObject({ verifiedBy: null, inherited: false })
    expect(notices.notifications.map((row) => row.key)).toEqual([`flujo:silabo.enviado:${NEW_ID}`])
    latest = { id: PREVIOUS, number: 2, correctionStage: "biblioteca" }
    notices.notifications = []
    await submit({ version_bloqueo: 7, idempotency_key: KEY })
    expect(notices.notifications.map((row) => [row.key, row.title])).toEqual([[`flujo:silabo.reenviado_biblioteca:${NEW_ID}`, "Sílabo corregido para revisar"]])
  })

  it("re-checks the version and the state under the lock", async () => {
    signedRoles = ["docente"]
    locked = { id: SYLLABUS, state: "borrador", version: 9 }
    const conflict = await submit({ version_bloqueo: 7, idempotency_key: KEY })
    expect(conflict).toMatchObject({ status: 409, json: { version_bloqueo_actual: 9 } })
    locked = { id: SYLLABUS, state: "en_revision", version: 7 }
    expect((await submit({ version_bloqueo: 7, idempotency_key: KEY })).json).toEqual({
      message: "La transición de envío ya no está permitida.",
      errors: { syllabus: ["La transición de envío ya no está permitida."] },
    })
    expect(revisions).toEqual([])
  })
})
