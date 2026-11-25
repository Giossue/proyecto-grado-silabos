import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, AppSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { requestInput, type PhpArray } from "../http/input"
import { aborted, forbidden, apiJson, validationError } from "../http/responses"
import { validateSchema } from "../http/schemaValidation"
import { LIBRARY_COMMENT_REASONS, libraryCommentSchema, OTHER_REASON } from "@silabos/shared/schemas/library"
import { signatureSchema } from "@silabos/shared/schemas/signature"
import { list } from "../configuration/phpValues"
import { scheduleWorkflowNotification, type NotificationScope } from "../notifications/store"
import { SignatureRejected, signatureSettings, type SignatureSettings } from "../signatures/cmsVerifier"
import { decisionSignatureFrom } from "../signatures/decisionSignature"
import { signDecision, type SignatureTx, type Verifier } from "../signatures/signDecision"
import { decisionBlock, hasRole, mayReview, ROLE_LIBRARIAN } from "../syllabus/policy"
import { blockedDecision, Missing, Rejected, settle, type DecisionRevision, type DecisionSyllabus } from "../syllabus/reviewDecisions"
import type { ReviewDetailStore, ReviewRevision } from "../syllabus/reviewDetails"
import type { DetailSyllabus } from "../syllabus/syllabusDetail"
import { createLibraryDecisionDeps } from "./reviewDecisionStore"
import { modelNotFound } from "../http/router"
import { MODELS } from "../http/models"

export type LockedLibrarySubmission = { id: string; verified: boolean }

export interface LibraryDecisionTx extends SignatureTx {
  notifications: NotificationScope
  coordinatorsForCareer(careerId: string): Promise<string[]>
  teachersFor(syllabusId: string): Promise<string[]>
  lockedDecisionBlock(syllabusId: string): Promise<string | null>
  lockSyllabus(id: string): Promise<DecisionSyllabus | null>
  lockSubmission(revisionId: string): Promise<LockedLibrarySubmission | null>
  latestRevisionId(syllabusId: string): Promise<string | null>
  revisionStage(revisionId: string): Promise<string | null>
  markVerified(submissionId: string, actorId: string, now: number): Promise<void>
  lockRevision(id: string): Promise<DecisionRevision | null>
  requestCorrection(revisionId: string, justification: string, stage: string, actorId: string, now: number): Promise<void>
  markCorrectionRequested(syllabusId: string, version: number, now: number): Promise<void>
}

export type LibraryDecisionDeps = {
  bridge: BridgeDeps
  store: Pick<ReviewDetailStore, "revision" | "syllabus" | "userName">
  settings: () => SignatureSettings & { requireHolderMatch: boolean }
  verify?: Verifier
  now: () => number
  transaction<T>(work: (tx: LibraryDecisionTx) => Promise<T>): Promise<T>
}

export function defaultLibraryDecisionDeps(): LibraryDecisionDeps {
  return { bridge: defaultBridgeDeps(), settings: () => signatureSettings(), ...createLibraryDecisionDeps() }
}

const LIBRARY = "biblioteca"
const OTHER = OTHER_REASON
export { LIBRARY_COMMENT_REASONS }

type Bound = { session: AppSession; revision: ReviewRevision; syllabus: DetailSyllabus }

async function bindRevision(request: Request, revisionId: string, deps: LibraryDecisionDeps): Promise<Bound | Response> {
  let bound: { revision: ReviewRevision; syllabus: DetailSyllabus } | null = null
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async (user) => {
        const revision = isUuid(revisionId) ? await deps.store.revision(revisionId) : null
        const syllabus = revision === null ? null : await deps.store.syllabus(revision.syllabusId, user.id)
        bound = revision === null || syllabus === null ? null : { revision, syllabus }
        return bound === null ? modelNotFound(MODELS.revision, revisionId) : null
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return session
  if (bound === null) return modelNotFound(MODELS.revision, revisionId)
  return { session, ...(bound as { revision: ReviewRevision; syllabus: DetailSyllabus }) }
}

function rejectRevision(message: string): never {
  throw new Rejected(validationError({ revision: [message] }))
}

function phpTrim(value: string): string {
  return value.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "")
}

export function commentText(codes: string[], other: string | null): string {
  const parts = codes.filter((code) => code !== OTHER).map((code) => LIBRARY_COMMENT_REASONS[code])
  if (codes.includes(OTHER)) parts.push(phpTrim(other ?? "").replace(/[. ]+$/, ""))
  return `${parts.join("; ")}.`
}

async function signedSettle(original: Request, deps: LibraryDecisionDeps, work: () => Promise<Response>): Promise<Response> {
  return settle(original, deps, async () => {
    try {
      return await work()
    } catch (error) {
      if (error instanceof SignatureRejected) return validationError({ signature: [error.message] })
      throw error
    }
  })
}

export async function verifyLibraryReview(request: Request, revisionId: string, deps: LibraryDecisionDeps = defaultLibraryDecisionDeps()): Promise<Response> {
  const original = request.clone()
  const bound = await bindRevision(original, revisionId, deps)
  if (bound instanceof Response) return bound
  const { session, revision, syllabus } = bound
  if (!hasRole(session, ROLE_LIBRARIAN)) return forbidden()
  const input: PhpArray = await requestInput(request)
  const { errors } = await validateSchema(signatureSchema, input)
  if (errors !== null) return validationError(errors)
  return signedSettle(original, deps, async () => {
    const signature = decisionSignatureFrom(input.signature)
    if (!mayReview(session, syllabus) || decisionBlock(syllabus) !== null) return aborted(403)
    const settings = deps.settings()
    const actor = { id: session.user.id, name: (await deps.store.userName(session.user.id)) ?? "" }
    await deps.transaction(async (tx) => {
      const block = await tx.lockedDecisionBlock(revision.syllabusId)
      const locked = await tx.lockSyllabus(revision.syllabusId)
      if (locked === null) throw new Missing(MODELS.syllabus, revision.syllabusId)
      const submission = await tx.lockSubmission(revision.id)
      if (submission === null) throw new Missing(MODELS.submission)
      if (submission.verified) return
      if (locked.state !== "en_revision" || (await tx.latestRevisionId(locked.id)) !== revision.id || (await tx.revisionStage(revision.id)) !== LIBRARY) {
        rejectRevision("Este sílabo ya no espera la revisión de biblioteca.")
      }
      if (block !== null) rejectRevision(block)
      const now = deps.now()
      await signDecision(tx, { revision: { id: revision.id, syllabusId: locked.id, number: revision.number, fingerprint: revision.fingerprint }, role: LIBRARY, signature, actor, now }, settings, deps.verify)
      await tx.markVerified(submission.id, session.user.id, now)
      await scheduleWorkflowNotification(tx.notifications, {
        syllabusId: locked.id,
        eventType: "biblioteca.verificado",
        deduplicationKey: `biblioteca.verificado:${revision.id}`,
        recipientIds: await tx.coordinatorsForCareer(syllabus.careerId),
        revisionNumber: revision.number,
      })
    })
    return apiJson({ message: "Sílabo firmado y enviado a coordinación." }, 201)
  })
}

export async function commentLibraryReview(request: Request, revisionId: string, deps: LibraryDecisionDeps = defaultLibraryDecisionDeps()): Promise<Response> {
  const original = request.clone()
  const bound = await bindRevision(original, revisionId, deps)
  if (bound instanceof Response) return bound
  const { session, revision, syllabus } = bound
  if (!hasRole(session, ROLE_LIBRARIAN) || !mayReview(session, syllabus)) return forbidden()
  const block = decisionBlock(syllabus)
  if (block !== null) return blockedDecision(block)
  const input: PhpArray = await requestInput(request)
  const { errors } = await validateSchema(libraryCommentSchema, input)
  if (errors !== null) return validationError(errors)
  const justification = commentText(list(input.reasons) as string[], typeof input.other === "string" ? input.other : null)
  return settle(original, deps, async () => {
    await deps.transaction(async (tx) => {
      const lockedBlock = await tx.lockedDecisionBlock(revision.syllabusId)
      const locked = await tx.lockSyllabus(revision.syllabusId)
      if (locked === null) throw new Missing(MODELS.syllabus, revision.syllabusId)
      if (locked.state !== "en_revision" || (await tx.latestRevisionId(locked.id)) !== revision.id) rejectRevision("La revisión dejó de estar disponible para solicitar corrección.")
      if (lockedBlock !== null) rejectRevision(lockedBlock)
      const current = await tx.lockRevision(revision.id)
      if (current === null) throw new Missing(MODELS.revision, revision.id)
      if (current.correctionRequested) rejectRevision("Esta revisión ya tiene una solicitud de corrección.")
      if ((await tx.revisionStage(revision.id)) !== LIBRARY) rejectRevision("La revisión no está en su etapa; otro revisor la tiene ahora.")
      const now = deps.now()
      await tx.requestCorrection(revision.id, justification, LIBRARY, session.user.id, now)
      await tx.markCorrectionRequested(locked.id, locked.version + 1, now)
      await scheduleWorkflowNotification(tx.notifications, {
        syllabusId: locked.id,
        eventType: "silabo.correccion_solicitada",
        deduplicationKey: `silabo.correccion_solicitada:${revision.id}`,
        recipientIds: await tx.teachersFor(locked.id),
        revisionNumber: revision.number,
      })
    })
    return apiJson({ message: "Comentario enviado. El docente corregirá el sílabo y lo reenviará; volverá a biblioteca." }, 201)
  })
}
