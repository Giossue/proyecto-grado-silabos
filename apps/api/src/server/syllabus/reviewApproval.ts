import type { PrismaService } from "../../prisma/prisma.service"
import { defaultBridgeDeps } from "../auth/requireSession"
import type { BridgeDeps, AppSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { canonicalHash } from "../documents/canonicalJson"
import { ExportForbidden, ExportRejected, existingExport, requestExport, type ExportRequestTx } from "../documents/syllabusExport"
import { requestInput, type PhpArray } from "../http/input"
import { aborted, forbidden, apiJson, validationError } from "../http/responses"
import { validateSchema } from "../http/schemaValidation"
import { signatureSchema } from "@silabos/shared/schemas/signature"
import { SignatureRejected, signatureSettings, type SignatureSettings } from "../signatures/cmsVerifier"
import { decisionSignatureFrom } from "../signatures/decisionSignature"
import { signDecision, type SignatureTx, type Verifier } from "../signatures/signDecision"
import { decisionBlock, hasRole, mayReview, ROLE_COORDINATOR } from "./policy"
import { blockedDecision, Missing, Rejected, settle, type DecisionSyllabus } from "./reviewDecisions"
import type { ReviewDetailStore, ReviewRevision } from "./reviewDetails"
import { createReviewApprovalDeps } from "./reviewApprovalStore"
import type { DetailSyllabus } from "./syllabusDetail"
import { modelNotFound } from "../http/router"
import { MODELS } from "../http/models"
import { requireBound, type Binder } from "./boundSession"

export interface ReviewApprovalTx extends SignatureTx {
  exports: ExportRequestTx
  lockedDecisionBlock(syllabusId: string): Promise<string | null>
  lockSyllabus(id: string): Promise<DecisionSyllabus | null>
  approvalExists(revisionId: string): Promise<boolean>
  latestRevisionId(syllabusId: string): Promise<string | null>
  revisionStage(revisionId: string): Promise<string | null>
  coordinationReviewId(revisionId: string): Promise<string | null>
  insertCoordinationReview(row: { id: string; revisionId: string; reviewerId: string; at: number }): Promise<void>
  insertApproval(row: { id: string; revisionId: string; key: string; fingerprint: string; approverId: string; at: number }): Promise<void>
  markApproved(syllabusId: string, version: number): Promise<void>
}

export type ReviewApprovalDeps = {
  bridge: BridgeDeps
  store: Pick<ReviewDetailStore, "revision" | "syllabus" | "userName">
  settings: () => SignatureSettings & { requireHolderMatch: boolean }
  verify?: Verifier
  now: () => number
  newId: () => string
  newKey: () => string
  transaction<T>(work: (tx: ReviewApprovalTx) => Promise<T>): Promise<T>
}

export function defaultReviewApprovalDeps(prisma: PrismaService): ReviewApprovalDeps {
  return { bridge: defaultBridgeDeps(), settings: () => signatureSettings(), ...createReviewApprovalDeps(prisma) }
}

const COORDINATION = "coordinacion"
const NOT_CURRENT = "Solo puede aprobarse la revisión vigente."
const NOT_WAITING = "La revisión ya no espera la decisión de coordinación."

export type ApprovalBound = { session: AppSession; revision: ReviewRevision; syllabus: DetailSyllabus }

export function approvalRevisionBinder(revisionId: string, deps: Pick<ReviewApprovalDeps, "store">): Binder<{ revision: ReviewRevision; syllabus: DetailSyllabus }> {
  return async (user) => {
    const revision = isUuid(revisionId) ? await deps.store.revision(revisionId) : null
    const syllabus = revision === null ? null : await deps.store.syllabus(revision.syllabusId, user.id)
    return revision === null || syllabus === null ? modelNotFound(MODELS.revision, revisionId) : { revision, syllabus }
  }
}

function rejectRevision(message: string): never {
  throw new Rejected(validationError({ revision: [message] }))
}

export async function settleExport(original: Request, deps: { bridge: BridgeDeps }, work: () => Promise<Response>): Promise<Response> {
  return settle(original, deps, async () => {
    try {
      return await work()
    } catch (error) {
      if (error instanceof SignatureRejected) return validationError({ signature: [error.message] })
      if (error instanceof ExportForbidden) return aborted(403)
      if (error instanceof ExportRejected) return validationError(error.errors)
      throw error
    }
  })
}

function iso8601(seconds: number): string {
  return `${new Date(seconds * 1000).toISOString().slice(0, 19)}+00:00`
}

export async function approveReview(request: Request, revisionId: string, deps: ReviewApprovalDeps): Promise<Response> {
  const bound = await requireBound(request.clone(), approvalRevisionBinder(revisionId, deps), deps.bridge)
  if (bound instanceof Response) return bound
  return approveReviewFor(request, { session: bound.session, ...bound.bound }, deps)
}

export async function approveReviewFor(request: Request, { session, revision, syllabus }: ApprovalBound, deps: ReviewApprovalDeps): Promise<Response> {
  const original = request.clone()
  if (!hasRole(session, ROLE_COORDINATOR) || !mayReview(session, syllabus)) return forbidden()
  const block = decisionBlock(syllabus)
  if (block !== null) return blockedDecision(block)
  const input: PhpArray = await requestInput(request)
  const { errors } = await validateSchema(signatureSchema, input)
  if (errors !== null) return validationError(errors)
  return settleExport(original, deps, async () => {
    const signature = decisionSignatureFrom(input.signature)
    const settings = deps.settings()
    const actor = { id: session.user.id, name: (await deps.store.userName(session.user.id)) ?? "" }
    await deps.transaction(async (tx) => {
      const lockedBlock = await tx.lockedDecisionBlock(revision.syllabusId)
      const locked = await tx.lockSyllabus(revision.syllabusId)
      if (locked === null) throw new Missing(MODELS.syllabus, revision.syllabusId)
      if (await tx.approvalExists(revision.id)) return
      const latest = await tx.latestRevisionId(locked.id)
      if (latest === null) throw new Missing(MODELS.revision)
      if (locked.state !== "en_revision" || latest !== revision.id) rejectRevision(NOT_CURRENT)
      if ((await tx.revisionStage(revision.id)) !== COORDINATION) rejectRevision(NOT_WAITING)
      if (lockedBlock !== null) rejectRevision(lockedBlock)
      const signedRevision = { id: revision.id, syllabusId: revision.syllabusId, number: revision.number, fingerprint: revision.fingerprint }
      await signDecision(tx, { revision: signedRevision, role: COORDINATION, signature, actor, now: deps.now() }, settings, deps.verify)
      const approvedAt = deps.now()
      if ((await tx.coordinationReviewId(revision.id)) === null) {
        await tx.insertCoordinationReview({ id: deps.newId(), revisionId: revision.id, reviewerId: actor.id, at: approvedAt })
      }
      const key = deps.newKey()
      const fingerprint = canonicalHash({
        revision_id: revision.id,
        revision_fingerprint: revision.fingerprint,
        approved_by: actor.id,
        approved_at: iso8601(approvedAt),
        idempotency_key: key,
      })
      const approvalId = deps.newId()
      await tx.insertApproval({ id: approvalId, revisionId: revision.id, key, fingerprint, approverId: actor.id, at: approvedAt })
      await tx.markApproved(locked.id, locked.version + 1)
      if ((await existingExport(tx.exports, revision.id, approvalId, actor.id)) !== null) return
      await requestExport(tx.exports, { revisionId: revision.id, syllabusId: revision.syllabusId, key: approvalId, actor: { id: actor.id }, now: deps.now(), newId: deps.newId })
    })
    return apiJson({ message: "Sílabo firmado y aprobado." })
  })
}
