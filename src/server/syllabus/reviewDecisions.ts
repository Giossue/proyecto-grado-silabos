import "server-only"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, LaravelSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { isJsonRequest, laravelInput, type PhpArray } from "../laravel/input"
import { forbidden, laravelJson, validationError } from "../laravel/responses"
import { validateInput } from "../laravel/validation"
import { scheduleWorkflowNotification, type NotificationScope } from "../notifications/store"
import type { AuditEventInput } from "../operations/recordAuditEvent"
import { decisionBlock, hasRole, mayReview, ROLE_COORDINATOR } from "./policy"
import type { ReviewDetailStore, ReviewRevision } from "./reviewDetails"
import { GenerationRejected } from "./inProgressWork"
import { NeedsLaravel } from "./snapshotDocuments"
import type { DetailSyllabus } from "./syllabusDetail"
import { createReviewDecisionDeps } from "./reviewDecisionStore"
import { modelNotFound } from "../laravel/router"
import { MODELS } from "../laravel/models"

export type DecisionSyllabus = { id: string; state: string; version: number; convocationId: string; parallelId: string }
export type DecisionRevision = { id: string; number: number; correctionRequested: boolean }

export interface ReviewDecisionTx {
  notifications: NotificationScope
  teachersFor(syllabusId: string): Promise<string[]>
  lockedDecisionBlock(syllabusId: string): Promise<string | null>
  decisionBlock(syllabusId: string): Promise<string | null>
  revisionCount(syllabusId: string): Promise<number>
  restartSyllabus(syllabus: DecisionSyllabus): Promise<string>
  lockSyllabus(id: string): Promise<DecisionSyllabus | null>
  latestRevisionId(syllabusId: string): Promise<string | null>
  lockRevision(id: string): Promise<DecisionRevision | null>
  revisionStage(id: string): Promise<string | null>
  requestCorrection(revisionId: string, justification: string, stage: string, actorId: string, now: number): Promise<void>
  markCorrectionRequested(syllabusId: string, version: number, now: number): Promise<void>
  recordAudit(event: AuditEventInput): Promise<void>
}

export type ReviewDecisionDeps = {
  bridge: BridgeDeps
  store: Pick<ReviewDetailStore, "revision" | "syllabus">
  now: () => number
  transaction<T>(work: (tx: ReviewDecisionTx) => Promise<T>): Promise<T>
}

export function defaultReviewDecisionDeps(): ReviewDecisionDeps {
  return { bridge: defaultBridgeDeps(), ...createReviewDecisionDeps() }
}

export class Rejected extends Error {
  constructor(readonly response: Response) {
    super("rejected")
  }
}

export class Missing extends Error {}

const COORDINATION = "coordinacion"
const UNAVAILABLE = "La revisión dejó de estar disponible para solicitar corrección."

async function bindRevision(
  request: Request,
  revisionId: string,
  deps: ReviewDecisionDeps,
): Promise<{ session: LaravelSession; revision: ReviewRevision; syllabus: DetailSyllabus } | Response> {
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

export function blockedDecision(block: string): Response {
  return laravelJson({ message: block }, 403)
}

export async function settle(original: Request, deps: { bridge: BridgeDeps }, work: () => Promise<Response>): Promise<Response> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof Rejected) return error.response
    if (error instanceof GenerationRejected) return validationError(error.errors)
    if (error instanceof Missing || error instanceof NeedsLaravel) return deps.bridge.forward(original)
    throw error
  }
}

function rejectRevision(message: string): never {
  throw new Rejected(validationError({ revision: [message] }))
}

export function auditOf(session: LaravelSession, action: string, resourceType: string, resourceId: string, metadata: AuditEventInput["metadata"], occurredAt: number): AuditEventInput {
  return { actorId: session.user.id, roleAssignmentId: session.activeRole?.id ?? null, action, resourceType, resourceId, result: "exito", metadata, occurredAt }
}

export async function requestCorrection(request: Request, revisionId: string, deps: ReviewDecisionDeps = defaultReviewDecisionDeps()): Promise<Response> {
  const original = request.clone()
  if (request.headers.get("content-type") !== null && !isJsonRequest(request)) return deps.bridge.forward(original)
  const bound = await bindRevision(request, revisionId, deps)
  if (bound instanceof Response) return bound
  const { session, revision, syllabus } = bound
  if (!hasRole(session, ROLE_COORDINATOR) || !mayReview(session, syllabus)) return forbidden()
  const block = decisionBlock(syllabus)
  if (block !== null) return blockedDecision(block)
  const input: PhpArray = await laravelInput(request)
  const errors = await validateInput(input, { justification: ["required", "string", { min: 10 }, { max: 10000 }] }, { justification: "justificación" })
  if (Object.keys(errors).length > 0) return validationError(errors)
  const justification = input.justification as string
  return settle(original, deps, async () => {
    await deps.transaction(async (tx) => {
      const lockedBlock = await tx.lockedDecisionBlock(revision.syllabusId)
      const locked = await tx.lockSyllabus(revision.syllabusId)
      if (locked === null) throw new Missing()
      if (locked.state !== "en_revision" || (await tx.latestRevisionId(locked.id)) !== revision.id) rejectRevision(UNAVAILABLE)
      if (lockedBlock !== null) rejectRevision(lockedBlock)
      const current = await tx.lockRevision(revision.id)
      if (current === null) throw new Missing()
      if (current.correctionRequested) rejectRevision("Esta revisión ya tiene una solicitud de corrección.")
      if ((await tx.revisionStage(revision.id)) !== COORDINATION) rejectRevision("La revisión no está en su etapa; otro revisor la tiene ahora.")
      const now = deps.now()
      await tx.requestCorrection(revision.id, justification, COORDINATION, session.user.id, now)
      await tx.markCorrectionRequested(locked.id, locked.version + 1, now)
      await tx.recordAudit(
        auditOf(session, "silabo.correccion_solicitada", "revision_silabo", revision.id, {
          revision_number: revision.number,
          from_state: "en_revision",
          to_state: "correccion_solicitada",
          stage: COORDINATION,
        }, now),
      )
      await scheduleWorkflowNotification(tx.notifications, {
        syllabusId: locked.id,
        eventType: "silabo.correccion_solicitada",
        deduplicationKey: `silabo.correccion_solicitada:${revision.id}`,
        recipientIds: await tx.teachersFor(locked.id),
        revisionNumber: revision.number,
      })
    })
    return laravelJson({ message: "Corrección solicitada; el docente ya puede editar una nueva versión de trabajo." })
  })
}

const PHP_TRIM = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g

async function bindSyllabus(request: Request, syllabusId: string, deps: ReviewDecisionDeps): Promise<{ session: LaravelSession; syllabus: DetailSyllabus } | Response> {
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

export async function resetSyllabus(request: Request, syllabusId: string, deps: ReviewDecisionDeps = defaultReviewDecisionDeps()): Promise<Response> {
  const original = request.clone()
  if (request.headers.get("content-type") !== null && !isJsonRequest(request)) return deps.bridge.forward(original)
  const bound = await bindSyllabus(request, syllabusId, deps)
  if (bound instanceof Response) return bound
  const { session, syllabus } = bound
  if (syllabus.state !== "aprobado" || !hasRole(session, ROLE_COORDINATOR) || !mayReview(session, syllabus)) return forbidden()
  const block = decisionBlock(syllabus)
  if (block !== null) return blockedDecision(block)
  const input: PhpArray = await laravelInput(request)
  const errors = await validateInput(input, { reason: ["required", "string", { min: 5 }, { max: 500 }] }, { reason: "motivo" })
  if (Object.keys(errors).length > 0) return validationError(errors)
  const reason = (input.reason as string).replace(PHP_TRIM, "")
  const reject = (message: string): never => {
    throw new Rejected(validationError({ syllabus: [message] }))
  }
  return settle(original, deps, async () => {
    await deps.transaction(async (tx) => {
      const locked = await tx.lockSyllabus(syllabus.id)
      if (locked === null) throw new Missing()
      if (locked.state !== "aprobado") reject("Solo se reinicia un sílabo aprobado.")
      const current = await tx.decisionBlock(locked.id)
      if (current !== null) reject(current)
      const deleted = { previous_syllabus_id: locked.id, paralelo_id: locked.parallelId, revisions: await tx.revisionCount(locked.id), reason }
      const teachers = await tx.teachersFor(locked.id)
      const fresh = await tx.restartSyllabus(locked)
      const now = deps.now()
      await tx.recordAudit(auditOf(session, "silabo.eliminado", "silabo", fresh, deleted, now))
      await scheduleWorkflowNotification(tx.notifications, {
        syllabusId: fresh,
        eventType: "silabo.eliminado",
        deduplicationKey: `silabo.eliminado:${fresh}`,
        recipientIds: teachers,
        revisionNumber: null,
        reason,
      })
    })
    return laravelJson({ message: "Sílabo reiniciado con todo su historial. El docente empieza de cero con la malla y la plantilla actuales." })
  })
}
