import { HttpFailure } from "../http/failures"
import type { AppSession } from "../auth/types"
import { aborted, apiJson, validationError } from "../http/responses"
import type { LogoStore } from "../shared/logoStore"
import { presentationLogos } from "../configuration/institutionalLogos"
import { isPhpArray, list, phpShape, record, type PhpRecord } from "../configuration/phpValues"
import { templatePresentationOf } from "../configuration/templatePresentation"
import { TemplateValidationError } from "../configuration/templateRuntime"
import { LIBRARY_COMMENT_REASONS } from "@silabos/shared/schemas/library"
import { isoFromSeconds } from "../syllabus/draftField"
import { dataGet } from "../syllabus/identificationCard"
import { decisionBlock } from "../syllabus/policy"
import { presentSnapshot, signingStatement, snapshotDefinition } from "../syllabus/snapshotDocuments"
import { signatureSummary } from "../syllabus/syllabusDetail"
import type { HistoryEntry, ReviewDetailStore, ReviewRevision } from "../syllabus/reviewDetails"
import type { LibraryReviewRepository } from "./reviews"

export type LibraryReviewDetailDeps = { store: ReviewDetailStore; libraryReviews: LibraryReviewRepository; logos: LogoStore }

const LIBRARY = "biblioteca"
const COORDINATION = "coordinacion"

function revisionStage(entry: HistoryEntry | undefined): string | null {
  if (entry?.approval) return null
  return entry?.library?.verifiedAt ? COORDINATION : LIBRARY
}

async function respond(build: () => Promise<PhpRecord>): Promise<Response> {
  try {
    return apiJson(phpShape(await build()))
  } catch (error) {
    if (error instanceof HttpFailure) return error.response
    if (error instanceof TemplateValidationError) return validationError(error.errors)
    throw error
  }
}

export async function libraryReviewPayload(request: Request, session: AppSession, bound: ReviewRevision, deps: LibraryReviewDetailDeps): Promise<Response> {
  const submission = await deps.store.librarySubmission(bound.id)
  if (submission === null) return aborted(404)
  const syllabus = await deps.store.syllabus(bound.syllabusId, session.user.id)
  const summary = syllabus === null ? undefined : (await deps.libraryReviews.summaries([syllabus.id])).get(syllabus.id)
  if (syllabus === null || summary === undefined) return aborted(404)
  return respond(async () => {
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
        comment_reasons: Object.entries(LIBRARY_COMMENT_REASONS).map(([code, label]) => ({ code, label })),
      },
    }
  })
}
