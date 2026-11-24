import "server-only"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, LaravelSession } from "../auth/types"
import { isUuid } from "../academic/structure"
import { aborted, laravelJson, validationError } from "../laravel/responses"
import { createLogoStore, presentationLogos, type LogoStore } from "../configuration/institutionalLogos"
import { isPhpArray, list, phpShape, record, type PhpRecord } from "../configuration/phpValues"
import { templatePresentationOf } from "../configuration/templatePresentation"
import { TemplateValidationError } from "../configuration/templateRuntime"
import { createLibraryReviewRepository } from "../library/reviewQueries"
import { authorizeListing, type LibraryReviewRepository } from "../library/reviews"
import { isoFromSeconds } from "./draftField"
import { dataGet } from "./identificationCard"
import { convocationAllowsDecisions, decisionBlock, mayReview } from "./policy"
import { NeedsLaravel, presentSnapshot, signingStatement, snapshotDefinition, type SignatureRecord } from "./snapshotDocuments"
import { signatureSummary, type DetailSyllabus, type ReviewComment } from "./syllabusDetail"
import { createReviewDetailStore } from "./reviewDetailQueries"

export type ReviewRevision = { id: string; syllabusId: string; number: number; submittedAt: number; submittedBy: string; fingerprint: string }

export type HistoryEntry = {
  id: string
  number: number
  submittedAt: string
  submittedBy: string
  coordination: { at: string; reviewerId: string; reviewer: string } | null
  approval: { at: string; approverId: string; approver: string } | null
  library: { verifiedAt: string | null; verifier: string | null; inherited: boolean } | null
  correction: { stage: string; at: string; by: string | null; justification: string | null } | null
}

export type LibrarySubmissionRow = { sentAt: number; sentBy: string; verifiedAt: string | null; verifiedBy: string | null; state: string; outcome: string | null; responsibleId: string | null }

export interface ReviewDetailStore {
  revision(id: string): Promise<ReviewRevision | null>
  syllabus(id: string, userId: string): Promise<DetailSyllabus | null>
  teachers(syllabusId: string): Promise<string[]>
  history(syllabusId: string): Promise<HistoryEntry[]>
  snapshot(revisionId: string): Promise<unknown>
  signatures(syllabusId: string): Promise<SignatureRecord[]>
  librarySubmission(revisionId: string): Promise<LibrarySubmissionRow | null>
  userName(id: string): Promise<string | null>
  comments(syllabusId: string, stage: string): Promise<ReviewComment[]>
}

export type ReviewDetailDeps = { bridge: BridgeDeps; store: ReviewDetailStore; libraryReviews: LibraryReviewRepository; logos: LogoStore }

export function defaultReviewDetailDeps(): ReviewDetailDeps {
  return { bridge: defaultBridgeDeps(), store: createReviewDetailStore(), libraryReviews: createLibraryReviewRepository(), logos: createLogoStore() }
}

const LIBRARY = "biblioteca"
const COORDINATION = "coordinacion"
const WEIGHTS: Record<string, number> = { enviado: 0, coordinacion_aprobo: 1, biblioteca_verifico: 2, correccion: 3, devuelto_biblioteca: 3, aprobado: 4 }
const COMMENT_REASONS: [string, string][] = [
  ["libro_no_disponible", "El libro no está disponible en biblioteca"],
  ["codigo_incorrecto", "El código del libro es incorrecto"],
  ["isbn_incorrecto", "El ISBN es incorrecto"],
  ["edicion_desactualizada", "La edición está desactualizada"],
  ["datos_incompletos", "Los datos de la obra están incompletos"],
  ["otro", "Otro motivo"],
]

function revisionStage(entry: HistoryEntry | undefined): string | null {
  if (entry?.approval) return null
  return entry?.library?.verifiedAt ? COORDINATION : LIBRARY
}

function stageForRole(session: LaravelSession): string | null {
  const role = session.activeRole?.role
  return role === "bibliotecario" ? LIBRARY : role === "coordinador" ? COORDINATION : null
}

function byNumber(history: HistoryEntry[]): HistoryEntry[] {
  return [...history].sort((left, right) => left.number - right.number)
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

type TimelineEvent = { kind: string; at: string | null; revision_id: string; revision_number: number; by: string | null; comment: string | null; previous_id: string | null }

export function reviewTimeline(history: HistoryEntry[]): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const event = (item: HistoryEntry, kind: string, at: string | null, by: string | null, comment: string | null = null, previous: string | null = null): TimelineEvent => ({
    kind,
    at,
    revision_id: item.id,
    revision_number: item.number,
    by,
    comment,
    previous_id: previous,
  })
  history.forEach((item, index) => {
    events.push(event(item, "enviado", item.submittedAt, item.submittedBy, null, history[index - 1]?.id ?? null))
    if (item.library !== null && item.library.verifiedAt !== null && !item.library.inherited) events.push(event(item, "biblioteca_verifico", item.library.verifiedAt, item.library.verifier))
    const approvedHere = item.approval !== null && item.coordination !== null && item.approval.approverId === item.coordination.reviewerId
    if (item.coordination !== null && !approvedHere) events.push(event(item, "coordinacion_aprobo", item.coordination.at, item.coordination.reviewer))
    if (item.correction !== null) {
      const fromLibrary = item.correction.stage === LIBRARY
      events.push(event(item, fromLibrary ? "devuelto_biblioteca" : "correccion", item.correction.at, fromLibrary ? null : item.correction.by, fromLibrary ? null : item.correction.justification))
    }
    if (item.approval !== null) events.push(event(item, "aprobado", item.approval.at, approvedHere ? item.coordination!.reviewer : null))
  })
  return events.sort(
    (left, right) =>
      compareStrings(right.at ?? "", left.at ?? "") || right.revision_number - left.revision_number || WEIGHTS[right.kind] - WEIGHTS[left.kind],
  )
}

async function bindRevision(request: Request, revisionId: string, deps: ReviewDetailDeps, userId: string) {
  const revision = await deps.store.revision(revisionId)
  const syllabus = revision === null ? null : await deps.store.syllabus(revision.syllabusId, userId)
  return revision === null || syllabus === null ? null : { revision, syllabus }
}

async function respond(request: Request, deps: ReviewDetailDeps, build: () => Promise<PhpRecord>): Promise<Response> {
  try {
    return laravelJson(phpShape(await build()))
  } catch (error) {
    if (error instanceof NeedsLaravel) return deps.bridge.forward(request)
    if (error instanceof TemplateValidationError) return validationError(error.errors)
    throw error
  }
}

export async function coordinationReviewDetail(request: Request, revisionId: string, deps: ReviewDetailDeps = defaultReviewDetailDeps()): Promise<Response> {
  if (!isUuid(revisionId)) return deps.bridge.forward(request)
  const holder: { bound: Awaited<ReturnType<typeof bindRevision>> } = { bound: null }
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: async (user) => {
        holder.bound = await bindRevision(request, revisionId, deps, user.id)
        return holder.bound === null ? deps.bridge.forward(request) : null
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return session
  if (holder.bound === null) return deps.bridge.forward(request)
  const { revision, syllabus } = holder.bound
  if (!mayReview(session, syllabus)) return aborted(403)
  return respond(request, deps, async () => {
    const history = byNumber(await deps.store.history(syllabus.id))
    const latest = history[history.length - 1]
    const block = decisionBlock(syllabus)
    const myStage = stageForRole(session)
    const stage = syllabus.state === "en_revision" && latest?.id === revision.id ? (revisionStage(history.find((item) => item.id === revision.id)) ?? LIBRARY) : null
    const fotografia = record(await deps.store.snapshot(revision.id))
    const definition = snapshotDefinition(fotografia)
    const canDecide = block === null && stage !== null && stage === myStage
    const signatures = await deps.store.signatures(syllabus.id)
    const mustSign = canDecide && myStage === COORDINATION && !signatures.some((signature) => signature.role === COORDINATION)
    const current = history.find((item) => item.id === revision.id)
    const correction = current?.correction ?? null
    return {
      syllabus: {
        id: syllabus.id,
        subject: syllabus.subject,
        code: syllabus.code,
        period: syllabus.period,
        state: syllabus.state,
        stage,
        teachers: await deps.store.teachers(syllabus.id),
      },
      my_stage: myStage,
      can_decide: canDecide,
      signing_statement: mustSign ? signingStatement(syllabus.id, COORDINATION, revision.fingerprint) : null,
      signatures: signatureSummary(signatures),
      presentation: templatePresentationOf(definition, await presentationLogos(request, dataGet(syllabus.context, "career.faculty_id"), deps.logos)),
      revision: {
        id: revision.id,
        number: revision.number,
        submitted_at: isoFromSeconds(revision.submittedAt),
        submitted_by: revision.submittedBy,
        snapshot: presentSnapshot(fotografia),
        is_current: latest?.id === revision.id,
      },
      history: history.map((item) => ({
        id: item.id,
        number: item.number,
        submitted_at: item.submittedAt,
        submitted_by: item.submittedBy,
        coordination_reviewed_at: item.coordination?.at ?? null,
        coordination_reviewed_by: item.coordination?.reviewer ?? null,
        approved_at: item.approval?.at ?? null,
        approved_by: item.approval?.approver ?? null,
      })),
      timeline: reviewTimeline(history),
      correction_request:
        correction === null
          ? null
          : {
              justification: correction.stage === LIBRARY ? null : correction.justification,
              stage: correction.stage,
              requested_by: correction.stage === LIBRARY ? null : correction.by,
              requested_at: correction.at,
            },
      decisions_allowed: block === null,
      convocation_closed: !convocationAllowsDecisions(syllabus.convocationState),
      decision_block: block,
      reset: {
        allowed: block === null && myStage === COORDINATION && syllabus.state === "aprobado",
        erases_history: syllabus.state === "aprobado",
        revisions: history.length,
        signatures: signatures.length,
        has_pdf: syllabus.state === "aprobado",
      },
    }
  })
}

export async function libraryReviewDetail(request: Request, revisionId: string, deps: ReviewDetailDeps = defaultReviewDetailDeps()): Promise<Response> {
  if (!isUuid(revisionId)) return deps.bridge.forward(request)
  let revision: ReviewRevision | null = null
  const authorized = await authorizeListing(request, { bridge: deps.bridge, reviews: deps.libraryReviews }, async () => {
    revision = await deps.store.revision(revisionId)
    return revision === null ? deps.bridge.forward(request) : null
  })
  if (authorized instanceof Response) return authorized
  if (revision === null) return deps.bridge.forward(request)
  const bound = revision as ReviewRevision
  const { session } = authorized
  const submission = await deps.store.librarySubmission(bound.id)
  if (submission === null) return aborted(404)
  const syllabus = await deps.store.syllabus(bound.syllabusId, session.user.id)
  const summary = syllabus === null ? undefined : (await deps.libraryReviews.summaries([syllabus.id])).get(syllabus.id)
  if (syllabus === null || summary === undefined) return aborted(404)
  return respond(request, deps, async () => {
    const history = await deps.store.history(syllabus.id)
    const entry = history.find((item) => item.id === bound.id)
    const responsible = submission.responsibleId === null ? null : await deps.store.userName(submission.responsibleId)
    const block = decisionBlock(syllabus)
    const reviewable = submission.state === "pendiente" && syllabus.state === "en_revision" && revisionStage(entry) === LIBRARY && block === null
    const signatures = await deps.store.signatures(syllabus.id)
    const snapshot = presentSnapshot(record(await deps.store.snapshot(bound.id)))
    const definition = snapshotDefinition(snapshot)
    const libraryKeys = list(definition.library_sections ?? [])
    return {
      review: {
        syllabus_id: syllabus.id,
        subject: summary.subject,
        code: summary.code,
        faculty: summary.faculty,
        career: summary.career,
        period: summary.period,
        parallels: [summary.parallel],
        teachers: summary.teachers,
        revision_number: bound.number,
        revision_id: bound.id,
        sent_at: isoFromSeconds(submission.sentAt),
        sent_by: submission.sentBy,
        state: submission.state,
        outcome: submission.state === "atendido" && typeof submission.outcome === "string" ? submission.outcome : null,
        responsible,
        assigned_to_other: submission.state === "pendiente" && submission.responsibleId !== null && submission.responsibleId !== session.user.id,
        can_comment: reviewable,
        can_verify: reviewable,
        decision_block: block,
        signing_statement: reviewable && !signatures.some((signature) => signature.role === LIBRARY) ? signingStatement(syllabus.id, LIBRARY, bound.fingerprint) : null,
        signatures: signatureSummary(signatures),
        verified_at: submission.verifiedAt,
        verified_by: submission.verifiedBy,
        approved_at: entry?.approval?.at ?? null,
        presentation: templatePresentationOf(definition, await presentationLogos(request, dataGet(syllabus.context, "career.faculty_id"), deps.logos)),
        template_variables: isPhpArray(snapshot.template_variables) ? snapshot.template_variables : [],
        sections: list(isPhpArray(snapshot.sections) ? snapshot.sections : []).filter((section) => isPhpArray(section) && libraryKeys.includes(record(section).key ?? null)),
        comments: (await deps.store.comments(syllabus.id, LIBRARY)).map(({ comment, commented_at, commented_by, revision_number }) => ({ comment, commented_at, commented_by, revision_number })),
        comment_reasons: COMMENT_REASONS.map(([code, label]) => ({ code, label })),
      },
    }
  })
}
