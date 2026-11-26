import { HttpFailure, Missing, reportedServerError } from "../http/failures"

export { Missing }
import type { PrismaService } from "../../prisma/prisma.service"
import { defaultBridgeDeps } from "../auth/requireSession"
import type { BridgeDeps, AppSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { requestInput, type PhpArray } from "../http/input"
import { forbidden, apiJson, validationError } from "../http/responses"
import { changeRequestSchema, restartSchema } from "@silabos/shared/schemas/syllabus"
import { validateSchema } from "../http/schemaValidation"
import { scheduleWorkflowNotification, type NotificationScope } from "../notifications/store"
import { decisionBlock, hasRole, mayReview, ROLE_COORDINATOR } from "./policy"
import type { ReviewDetailStore, ReviewRevision } from "./reviewDetails"
import { GenerationRejected } from "./inProgressWorkHelpers"
import type { DetailSyllabus } from "./syllabusDetail"
import { createReviewDecisionDeps } from "./reviewDecisionStore"
import { modelNotFound } from "../http/router"
import { MODELS } from "../http/models"
import { requireBound, type Binder } from "./boundSession"

export type DecisionSyllabus = { id: string; state: string; version: number; convocationId: string; parallelId: string }
export type DecisionRevision = { id: string; number: number; correctionRequested: boolean }

export interface ReviewDecisionTx {
  notifications: NotificationScope
  teachersFor(syllabusId: string): Promise<string[]>
  lockedDecisionBlock(syllabusId: string): Promise<string | null>
  decisionBlock(syllabusId: string): Promise<string | null>
  restartSyllabus(syllabus: DecisionSyllabus): Promise<string>
  lockSyllabus(id: string): Promise<DecisionSyllabus | null>
  latestRevisionId(syllabusId: string): Promise<string | null>
  lockRevision(id: string): Promise<DecisionRevision | null>
  revisionStage(id: string): Promise<string | null>
  requestCorrection(revisionId: string, justification: string, stage: string, actorId: string, now: number): Promise<void>
  markCorrectionRequested(syllabusId: string, version: number, now: number): Promise<void>
}

export type ReviewDecisionDeps = {
  bridge: BridgeDeps
  store: Pick<ReviewDetailStore, "revision" | "syllabus">
  now: () => number
  transaction<T>(work: (tx: ReviewDecisionTx) => Promise<T>): Promise<T>
}

export function defaultReviewDecisionDeps(prisma: PrismaService): ReviewDecisionDeps {
  return { bridge: defaultBridgeDeps(), ...createReviewDecisionDeps(prisma) }
}

export class Rejected extends Error {
  constructor(readonly response: Response) {
    super("rejected")
  }
}

const COORDINATION = "coordinacion"
const UNAVAILABLE = "La revisión dejó de estar disponible para solicitar corrección."

export function decisionRevisionBinder(revisionId: string, deps: Pick<ReviewDecisionDeps, "store">): Binder<{ revision: ReviewRevision; syllabus: DetailSyllabus }> {
  return async (user) => {
    const revision = isUuid(revisionId) ? await deps.store.revision(revisionId) : null
    const syllabus = revision === null ? null : await deps.store.syllabus(revision.syllabusId, user.id)
    return revision === null || syllabus === null ? modelNotFound(MODELS.revision, revisionId) : { revision, syllabus }
  }
}

export type DecisionBound = { session: AppSession; revision: ReviewRevision; syllabus: DetailSyllabus }

async function bindRevision(request: Request, revisionId: string, deps: ReviewDecisionDeps): Promise<DecisionBound | Response> {
  const bound = await requireBound(request, decisionRevisionBinder(revisionId, deps), deps.bridge)
  if (bound instanceof Response) return bound
  return { session: bound.session, ...bound.bound }
}

export function blockedDecision(block: string): Response {
  return apiJson({ message: block }, 403)
}

export async function settle(original: Request, deps: { bridge: BridgeDeps }, work: () => Promise<Response>): Promise<Response> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof Rejected) return error.response
    if (error instanceof GenerationRejected) return validationError(error.errors)
    if (error instanceof HttpFailure) return error.response
    return reportedServerError(error)
  }
}

function rejectRevision(message: string): never {
  throw new Rejected(validationError({ revision: [message] }))
}

export async function requestCorrection(request: Request, revisionId: string, deps: ReviewDecisionDeps): Promise<Response> {
  const bound = await bindRevision(request, revisionId, deps)
  if (bound instanceof Response) return bound
  return requestCorrectionFor(request, bound, deps)
}

export async function requestCorrectionFor(request: Request, { session, revision, syllabus }: DecisionBound, deps: ReviewDecisionDeps): Promise<Response> {
  const original = request.clone()
  if (!hasRole(session, ROLE_COORDINATOR) || !mayReview(session, syllabus)) return forbidden()
  const block = decisionBlock(syllabus)
  if (block !== null) return blockedDecision(block)
  const input: PhpArray = await requestInput(request)
  const { errors } = await validateSchema(changeRequestSchema, input)
  if (errors !== null) return validationError(errors)
  const justification = input.justification as string
  return settle(original, deps, async () => {
    await deps.transaction(async (tx) => {
      const lockedBlock = await tx.lockedDecisionBlock(revision.syllabusId)
      const locked = await tx.lockSyllabus(revision.syllabusId)
      if (locked === null) throw new Missing(MODELS.syllabus, revision.syllabusId)
      if (locked.state !== "en_revision" || (await tx.latestRevisionId(locked.id)) !== revision.id) rejectRevision(UNAVAILABLE)
      if (lockedBlock !== null) rejectRevision(lockedBlock)
      const current = await tx.lockRevision(revision.id)
      if (current === null) throw new Missing(MODELS.revision, revision.id)
      if (current.correctionRequested) rejectRevision("Esta revisión ya tiene una solicitud de corrección.")
      if ((await tx.revisionStage(revision.id)) !== COORDINATION) rejectRevision("La revisión no está en su etapa; otro revisor la tiene ahora.")
      const now = deps.now()
      await tx.requestCorrection(revision.id, justification, COORDINATION, session.user.id, now)
      await tx.markCorrectionRequested(locked.id, locked.version + 1, now)
      await scheduleWorkflowNotification(tx.notifications, {
        syllabusId: locked.id,
        eventType: "silabo.correccion_solicitada",
        deduplicationKey: `silabo.correccion_solicitada:${revision.id}`,
        recipientIds: await tx.teachersFor(locked.id),
        revisionNumber: revision.number,
      })
    })
    return apiJson({ message: "Corrección solicitada; el docente ya puede editar una nueva versión de trabajo." })
  })
}

const PHP_TRIM = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g

export function decisionSyllabusBinder(syllabusId: string, deps: Pick<ReviewDecisionDeps, "store">): Binder<DetailSyllabus> {
  return async (user) => {
    const syllabus = isUuid(syllabusId) ? await deps.store.syllabus(syllabusId, user.id) : null
    return syllabus === null ? modelNotFound(MODELS.syllabus, syllabusId) : syllabus
  }
}

export async function resetSyllabus(request: Request, syllabusId: string, deps: ReviewDecisionDeps): Promise<Response> {
  const bound = await requireBound(request, decisionSyllabusBinder(syllabusId, deps), deps.bridge)
  if (bound instanceof Response) return bound
  return resetSyllabusFor(request, bound.session, bound.bound, deps)
}

export async function resetSyllabusFor(request: Request, session: AppSession, syllabus: DetailSyllabus, deps: ReviewDecisionDeps): Promise<Response> {
  const original = request.clone()
  if (syllabus.state !== "aprobado" || !hasRole(session, ROLE_COORDINATOR) || !mayReview(session, syllabus)) return forbidden()
  const block = decisionBlock(syllabus)
  if (block !== null) return blockedDecision(block)
  const input: PhpArray = await requestInput(request)
  const { errors } = await validateSchema(restartSchema, input)
  if (errors !== null) return validationError(errors)
  const reason = (input.reason as string).replace(PHP_TRIM, "")
  const reject = (message: string): never => {
    throw new Rejected(validationError({ syllabus: [message] }))
  }
  return settle(original, deps, async () => {
    await deps.transaction(async (tx) => {
      const locked = await tx.lockSyllabus(syllabus.id)
      if (locked === null) throw new Missing(MODELS.syllabus, syllabus.id)
      if (locked.state !== "aprobado") reject("Solo se reinicia un sílabo aprobado.")
      const current = await tx.decisionBlock(locked.id)
      if (current !== null) reject(current)
      const teachers = await tx.teachersFor(locked.id)
      const fresh = await tx.restartSyllabus(locked)
      await scheduleWorkflowNotification(tx.notifications, {
        syllabusId: fresh,
        eventType: "silabo.eliminado",
        deduplicationKey: `silabo.eliminado:${fresh}`,
        recipientIds: teachers,
        revisionNumber: null,
        reason,
      })
    })
    return apiJson({ message: "Sílabo reiniciado con todo su historial. El docente empieza de cero con la malla y la plantilla actuales." })
  })
}
