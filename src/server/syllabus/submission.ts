import "server-only"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, LaravelSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { isJsonRequest, laravelInput, type PhpArray } from "../laravel/input"
import { expectsJson } from "../laravel/request"
import { aborted, forbidden, laravelJson, validationError } from "../laravel/responses"
import { validateInput, type Rule } from "../laravel/validation"
import { uuid7 } from "../laravel/uuid7"
import { isPhpArray, list, phpIntCast, record, type PhpRecord } from "../configuration/phpValues"
import { scheduleWorkflowNotification, type NotificationScope } from "../notifications/store"
import { institutionToday } from "../dashboard/dashboardQueries"
import { canonicalHash } from "../documents/canonicalJson"
import { SignatureRejected, signatureSettings, type SignatureSettings } from "../signatures/cmsVerifier"
import { decisionSignatureFrom } from "../signatures/decisionSignature"
import { signDecision, type SignatureTx, type Verifier } from "../signatures/signDecision"
import { hasRole, isRunning, ROLE_TEACHER } from "./policy"
import { NeedsLaravel, signingStatement, snapshotDefinition } from "./snapshotDocuments"
import type { DetailSyllabus } from "./syllabusDetail"
import { createSubmissionDeps } from "./submissionStore"
import { modelNotFound } from "../laravel/router"
import { MODELS } from "../laravel/models"

export type SubmissionSchedule = { convocationState: string; processState: string; startsOn: string; dueOn: string }
export type KeyedRevision = { id: string; number: number; submittedBy: string }
export type LatestRevision = { id: string; number: number; correctionStage: string | null }
export type LockedSubmission = { id: string; state: string; version: number }
export type Verification = { verifiedBy: string; verifiedAt: number; snapshot: unknown }

export type RevisionRow = {
  id: string
  syllabusId: string
  previousId: string | null
  number: number
  key: string
  version: number
  snapshot: PhpRecord
  fingerprint: string
  submittedBy: string
  submittedAt: number
}

export type LibrarySubmissionRow = { revisionId: string; verifiedBy: string | null; verifiedAt: number | null; inherited: boolean }

export interface SubmissionTx extends SignatureTx {
  notifications: NotificationScope
  librarians(): Promise<string[]>
  lockSyllabus(id: string): Promise<LockedSubmission | null>
  revisionByKey(syllabusId: string, key: string): Promise<KeyedRevision | null>
  lockLatestRevision(syllabusId: string): Promise<LatestRevision | null>
  snapshot(syllabusId: string): Promise<PhpRecord>
  createRevision(row: RevisionRow): Promise<void>
  lastVerification(syllabusId: string): Promise<Verification | null>
  createLibrarySubmission(row: LibrarySubmissionRow): Promise<void>
  markSubmitted(syllabusId: string, version: number, now: number): Promise<void>
}

export interface SubmissionStore {
  syllabus(id: string, userId: string): Promise<DetailSyllabus | null>
  schedule(syllabusId: string): Promise<SubmissionSchedule | null>
  revisionByKey(syllabusId: string, key: string): Promise<KeyedRevision | null>
  signed(syllabusId: string, role: string): Promise<boolean>
  snapshot(syllabusId: string): Promise<PhpRecord>
  userName(id: string): Promise<string>
  transaction<T>(work: (tx: SubmissionTx) => Promise<T>): Promise<T>
}

export type SubmissionDeps = {
  bridge: BridgeDeps
  store: SubmissionStore
  validate: (request: Request, syllabusId: string) => Promise<number | null>
  payload: (request: Request, session: LaravelSession, syllabusId: string) => Promise<PhpRecord>
  settings: () => SignatureSettings & { requireHolderMatch: boolean }
  verify?: Verifier
  today: () => string
  now: () => number
  newId: () => string
}

export function defaultSubmissionDeps(): SubmissionDeps {
  return {
    bridge: defaultBridgeDeps(),
    ...createSubmissionDeps(),
    settings: () => signatureSettings(),
    today: institutionToday,
    now: () => Math.floor(Date.now() / 1000),
    newId: uuid7,
  }
}

const TEACHER = "docente"
const SUBMIT_STATES = ["borrador", "correccion_solicitada", "en_revision"]
const EDITABLE = ["borrador", "correccion_solicitada"]
const CONFLICT = "El borrador cambió en otra sesión. Recarga antes de continuar."
const ATTRIBUTES = { version_bloqueo: "versión de edición", idempotency_key: "identificador de la solicitud", signature: "firma electrónica" }

class Rejected extends Error {
  constructor(readonly response: Response) {
    super("rejected")
  }
}

class Missing extends Error {}

function reject(attribute: string, message: string): never {
  throw new Rejected(validationError({ [attribute]: [message] }))
}

function conflict(request: Request, version: number): never {
  throw new Rejected(
    expectsJson(request)
      ? laravelJson({ message: CONFLICT, code: "conflicto_version_borrador", version_bloqueo_actual: version }, 409)
      : laravelJson({ message: CONFLICT }, 409),
  )
}

function maySubmit(session: LaravelSession, syllabus: DetailSyllabus): boolean {
  return (
    hasRole(session, ROLE_TEACHER) &&
    session.activeRole?.careerId === syllabus.careerId &&
    syllabus.currentTeacher &&
    isRunning(syllabus) &&
    SUBMIT_STATES.includes(syllabus.state)
  )
}

function slashDate(day: string): string {
  const [year, month, date] = day.split("-")
  return `${date}/${month}/${year}`
}

function assertOpen(schedule: SubmissionSchedule, today: string): void {
  if (schedule.convocationState === "pausada") reject("deadline", "La convocatoria está en pausa por decisión de la coordinación de su carrera. Podrá enviar cuando se reanude.")
  if (schedule.processState === "pausado") reject("deadline", "El proceso institucional está en pausa. Podrá enviar cuando Administración lo reanude.")
  if (schedule.processState === "cerrado") reject("deadline", "El proceso institucional ya se cerró y no admite más envíos.")
  if (today < schedule.startsOn) reject("deadline", `La convocatoria todavía no inicia; podrá enviar a partir del ${slashDate(schedule.startsOn)}.`)
  if (today > schedule.dueOn) reject("deadline", `El plazo de entrega venció el ${slashDate(schedule.dueOn)}. Pida una prórroga a Administración.`)
}

async function assertSubmittable(original: Request, syllabus: DetailSyllabus, expected: number, deps: SubmissionDeps): Promise<void> {
  if (!EDITABLE.includes(syllabus.state)) reject("syllabus", "El expediente no está listo para envío.")
  const schedule = await deps.store.schedule(syllabus.id)
  if (schedule === null) throw new Missing()
  assertOpen(schedule, deps.today())
  if (syllabus.version !== expected) conflict(original, syllabus.version)
}

type Bound = { session: LaravelSession; syllabus: DetailSyllabus }

async function bound(request: Request, syllabusId: string, deps: SubmissionDeps): Promise<Bound | Response> {
  let syllabus: DetailSyllabus | null = null
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async (user) => {
        syllabus = isUuid(syllabusId) ? await deps.store.syllabus(syllabusId, user.id) : null
        return syllabus === null ? modelNotFound(MODELS.syllabus, syllabusId) : null
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return session
  if (syllabus === null) return modelNotFound(MODELS.syllabus, syllabusId)
  return { session, syllabus }
}

async function settled(original: Request, deps: SubmissionDeps, work: () => Promise<Response>): Promise<Response> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof Rejected) return error.response
    if (error instanceof SignatureRejected) return validationError({ signature: [error.message] })
    if (error instanceof Missing || error instanceof NeedsLaravel) return deps.bridge.forward(original)
    throw error
  }
}

function bibliographyAnswers(snapshot: PhpRecord): PhpRecord[] {
  const keys = list(snapshotDefinition(snapshot).library_sections ?? [])
  const answers: PhpRecord[] = []
  for (const section of list(snapshot.sections ?? [])) {
    if (!isPhpArray(section) || !keys.includes(record(section).key ?? null)) continue
    for (const field of list(isPhpArray(record(section).fields) ? record(section).fields : [])) {
      if (!isPhpArray(field) || record(field).quien_llena === "institucional") continue
      answers.push({ section: record(section).key ?? null, field: record(field).key ?? null, value: record(field).value ?? null })
    }
  }
  return answers
}

async function unchangedVerification(tx: SubmissionTx, syllabusId: string, snapshot: PhpRecord): Promise<Verification | null> {
  const verified = await tx.lastVerification(syllabusId)
  if (verified === null) return null
  return canonicalHash(bibliographyAnswers(record(verified.snapshot))) === canonicalHash(bibliographyAnswers(snapshot)) ? verified : null
}

async function sent(request: Request, session: LaravelSession, syllabusId: string, number: number, deps: SubmissionDeps): Promise<Response> {
  return laravelJson({ message: `Revisión ${number} enviada.`, syllabus: await deps.payload(request, session, syllabusId) })
}

async function versionInput(request: Request, rules: Record<string, Rule[]>): Promise<{ input: PhpArray; errors: Record<string, string[]> }> {
  const input: PhpArray = await laravelInput(request)
  return { input, errors: await validateInput(input, rules, ATTRIBUTES) }
}

export async function submissionStatement(request: Request, syllabusId: string, deps: SubmissionDeps = defaultSubmissionDeps()): Promise<Response> {
  const original = request.clone()
  if (request.headers.get("content-type") !== null && !isJsonRequest(request)) return deps.bridge.forward(original)
  const auth = await bound(original, syllabusId, deps)
  if (auth instanceof Response) return auth
  if (!maySubmit(auth.session, auth.syllabus)) return forbidden()
  const { input, errors } = await versionInput(request, { version_bloqueo: ["required", "integer", { min: 0 }] })
  if (Object.keys(errors).length > 0) return validationError(errors)
  return settled(original, deps, async () => {
    await assertSubmittable(original, auth.syllabus, phpIntCast(input.version_bloqueo), deps)
    const snapshot = await deps.store.snapshot(auth.syllabus.id)
    return laravelJson({
      statement: signingStatement(auth.syllabus.id, TEACHER, canonicalHash(snapshot)),
      required: !(await deps.store.signed(auth.syllabus.id, TEACHER)),
    })
  })
}

export async function submitSyllabus(request: Request, syllabusId: string, deps: SubmissionDeps = defaultSubmissionDeps()): Promise<Response> {
  const original = request.clone()
  if (request.headers.get("content-type") !== null && !isJsonRequest(request)) return deps.bridge.forward(original)
  const auth = await bound(original, syllabusId, deps)
  if (auth instanceof Response) return auth
  const { session, syllabus } = auth
  if (!maySubmit(session, syllabus)) return forbidden()
  const { input, errors } = await versionInput(request, {
    version_bloqueo: ["required", "integer", { min: 0 }],
    idempotency_key: ["required", "uuid"],
    signature: ["nullable", "array"],
  })
  if (Object.keys(errors).length > 0) return validationError(errors)
  const expected = phpIntCast(input.version_bloqueo)
  const key = input.idempotency_key as string
  return settled(original, deps, async () => {
    const signature = decisionSignatureFrom(input.signature)
    const replay = async (revision: KeyedRevision | null): Promise<KeyedRevision | null> => {
      if (revision !== null && revision.submittedBy !== session.user.id) throw new Rejected(aborted(403))
      return revision
    }
    const existing = await replay(await deps.store.revisionByKey(syllabus.id, key))
    if (existing !== null) return sent(original, session, syllabus.id, existing.number, deps)
    await assertSubmittable(original, syllabus, expected, deps)
    await deps.store.snapshot(syllabus.id)
    const blocking = await deps.validate(original, syllabus.id)
    if (blocking === null) throw new Missing()
    if (blocking > 0) reject("validation", "Corrija los errores determinísticos antes de enviar.")
    const settings = deps.settings()
    const actor = { id: session.user.id, name: await deps.store.userName(session.user.id) }
    const number = await deps.store.transaction(async (tx) => {
      const locked = await tx.lockSyllabus(syllabus.id)
      if (locked === null) throw new Missing()
      const again = await replay(await tx.revisionByKey(locked.id, key))
      if (again !== null) return again.number
      if (locked.version !== expected) conflict(original, locked.version)
      if (!EDITABLE.includes(locked.state)) reject("syllabus", "La transición de envío ya no está permitida.")
      const previous = await tx.lockLatestRevision(locked.id)
      const snapshot = await tx.snapshot(locked.id)
      const now = deps.now()
      const revision: RevisionRow = {
        id: deps.newId(),
        syllabusId: locked.id,
        previousId: previous?.id ?? null,
        number: previous === null ? 1 : previous.number + 1,
        key,
        version: locked.version,
        snapshot,
        fingerprint: canonicalHash(snapshot),
        submittedBy: session.user.id,
        submittedAt: now,
      }
      await tx.createRevision(revision)
      await signDecision(tx, { revision: { id: revision.id, syllabusId: locked.id, number: revision.number, fingerprint: revision.fingerprint }, role: TEACHER, signature, actor, now }, settings, deps.verify)
      const carried = previous?.correctionStage === "coordinacion" ? await unchangedVerification(tx, locked.id, snapshot) : null
      await tx.createLibrarySubmission({ revisionId: revision.id, verifiedBy: carried?.verifiedBy ?? null, verifiedAt: carried?.verifiedAt ?? null, inherited: carried !== null })
      await tx.markSubmitted(locked.id, locked.version + 1, now)
      if (carried === null) {
        const event = previous?.correctionStage === "biblioteca" ? "silabo.reenviado_biblioteca" : "silabo.enviado"
        await scheduleWorkflowNotification(tx.notifications, {
          syllabusId: locked.id,
          eventType: event,
          deduplicationKey: `${event}:${revision.id}`,
          recipientIds: await tx.librarians(),
          revisionNumber: revision.number,
        })
      }
      return revision.number
    })
    return sent(original, session, syllabus.id, number, deps)
  })
}
