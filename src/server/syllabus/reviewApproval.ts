import "server-only"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, LaravelSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { canonicalHash } from "../documents/canonicalJson"
import { ExportForbidden, ExportMissing, ExportRejected, existingExport, requestExport, type ExportRequestTx } from "../documents/syllabusExport"
import { isJsonRequest, laravelInput, type PhpArray } from "../laravel/input"
import { aborted, forbidden, laravelJson, validationError } from "../laravel/responses"
import { validateInput } from "../laravel/validation"
import { SignatureRejected, signatureSettings, type SignatureSettings } from "../signatures/cmsVerifier"
import { decisionSignatureFrom } from "../signatures/decisionSignature"
import { signDecision, type SignatureTx, type Verifier } from "../signatures/signDecision"
import { decisionBlock, hasRole, mayReview, ROLE_COORDINATOR } from "./policy"
import { blockedDecision, Missing, Rejected, settle, type DecisionSyllabus } from "./reviewDecisions"
import type { ReviewDetailStore, ReviewRevision } from "./reviewDetails"
import { createReviewApprovalDeps } from "./reviewApprovalStore"
import type { DetailSyllabus } from "./syllabusDetail"
import { modelNotFound } from "../laravel/router"
import { MODELS } from "../laravel/models"

export interface ReviewApprovalTx extends SignatureTx {
  exports: ExportRequestTx
  lockedDecisionBlock(syllabusId: string): Promise<string | null>
  lockSyllabus(id: string): Promise<DecisionSyllabus | null>
  approvalExists(revisionId: string): Promise<boolean>
  latestRevisionId(syllabusId: string): Promise<string | null>
  revisionStage(revisionId: string): Promise<string | null>
  submitterId(revisionId: string): Promise<string | null>
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
  renderable: (revisionId: string) => Promise<boolean>
  rendererVersion: () => string
  now: () => number
  newId: () => string
  newKey: () => string
  transaction<T>(work: (tx: ReviewApprovalTx) => Promise<T>): Promise<T>
}

export function defaultReviewApprovalDeps(): ReviewApprovalDeps {
  return { bridge: defaultBridgeDeps(), settings: () => signatureSettings(), ...createReviewApprovalDeps() }
}

const COORDINATION = "coordinacion"
const NOT_CURRENT = "Solo puede aprobarse la revisión vigente."
const NOT_WAITING = "La revisión ya no espera la decisión de coordinación."

type Bound = { session: LaravelSession; revision: ReviewRevision; syllabus: DetailSyllabus }

async function bindRevision(request: Request, revisionId: string, deps: ReviewApprovalDeps): Promise<Bound | Response> {
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

export async function settleExport(original: Request, deps: { bridge: BridgeDeps }, work: () => Promise<Response>): Promise<Response> {
  return settle(original, deps, async () => {
    try {
      return await work()
    } catch (error) {
      if (error instanceof SignatureRejected) return validationError({ signature: [error.message] })
      if (error instanceof ExportForbidden) return aborted(403)
      if (error instanceof ExportRejected) return validationError(error.errors)
      if (error instanceof ExportMissing) throw new Missing()
      throw error
    }
  })
}

function iso8601(seconds: number): string {
  return `${new Date(seconds * 1000).toISOString().slice(0, 19)}+00:00`
}

export async function approveReview(request: Request, revisionId: string, deps: ReviewApprovalDeps = defaultReviewApprovalDeps()): Promise<Response> {
  const original = request.clone()
  if (request.headers.get("content-type") !== null && !isJsonRequest(request)) return deps.bridge.forward(original)
  const bound = await bindRevision(original, revisionId, deps)
  if (bound instanceof Response) return bound
  const { session, revision, syllabus } = bound
  if (!hasRole(session, ROLE_COORDINATOR) || !mayReview(session, syllabus)) return forbidden()
  const block = decisionBlock(syllabus)
  if (block !== null) return blockedDecision(block)
  const input: PhpArray = await laravelInput(request)
  const errors = await validateInput(input, { signature: ["nullable", "array"] }, { signature: "firma electrónica" })
  if (Object.keys(errors).length > 0) return validationError(errors)
  if (!(await deps.renderable(revision.id))) return deps.bridge.forward(original)
  return settleExport(original, deps, async () => {
    const signature = decisionSignatureFrom(input.signature)
    const settings = deps.settings()
    const actor = { id: session.user.id, name: (await deps.store.userName(session.user.id)) ?? "", roleAssignmentId: session.activeRole?.id ?? null }
    await deps.transaction(async (tx) => {
      const lockedBlock = await tx.lockedDecisionBlock(revision.syllabusId)
      const locked = await tx.lockSyllabus(revision.syllabusId)
      if (locked === null) throw new Missing()
      if (await tx.approvalExists(revision.id)) return
      const latest = await tx.latestRevisionId(locked.id)
      if (latest === null) throw new Missing()
      if (locked.state !== "en_revision" || latest !== revision.id) rejectRevision(NOT_CURRENT)
      if ((await tx.revisionStage(revision.id)) !== COORDINATION) rejectRevision(NOT_WAITING)
      if (lockedBlock !== null) rejectRevision(lockedBlock)
      const signedRevision = { id: revision.id, syllabusId: revision.syllabusId, number: revision.number, fingerprint: revision.fingerprint }
      await signDecision(tx, { revision: signedRevision, role: COORDINATION, signature, actor, now: deps.now() }, settings, deps.verify)
      const approvedAt = deps.now()
      let reviewId = await tx.coordinationReviewId(revision.id)
      const reviewCreated = reviewId === null
      if (reviewId === null) {
        reviewId = deps.newId()
        await tx.insertCoordinationReview({ id: reviewId, revisionId: revision.id, reviewerId: actor.id, at: approvedAt })
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
      const audit = (action: string, resourceType: string, resourceId: string, metadata: Record<string, string | number | boolean | null>) =>
        tx.recordAudit({ actorId: actor.id, roleAssignmentId: actor.roleAssignmentId, action, resourceType, resourceId, result: "exito", metadata, occurredAt: deps.now() })
      if (reviewCreated) await audit("silabo.revisado_coordinacion", "revision_coordinacion", reviewId, { revision_number: revision.number })
      await audit("silabo.aprobado", "aprobacion", approvalId, {
        revision_number: revision.number,
        from_state: "en_revision",
        to_state: "aprobado",
        fingerprint,
        self_approved: (await tx.submitterId(revision.id)) === actor.id,
      })
      const exportActor = { id: actor.id, roleAssignmentId: actor.roleAssignmentId }
      if ((await existingExport(tx.exports, revision.id, approvalId, actor.id)) !== null) return
      await requestExport(tx.exports, { revisionId: revision.id, syllabusId: revision.syllabusId, key: approvalId, actor: exportActor, now: deps.now(), newId: deps.newId, rendererVersion: deps.rendererVersion() })
    })
    return laravelJson({ message: "Sílabo firmado y aprobado." })
  })
}
