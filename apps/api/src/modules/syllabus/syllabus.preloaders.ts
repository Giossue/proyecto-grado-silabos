import { resumableConvocationBinder, type ConvocationWriteDeps } from "../../server/syllabus/convocationWrites"
import { convocationBinder, type ConvocationDeps } from "../../server/syllabus/convocations"
import { comparisonBinder, type CoordinationReviewDeps } from "../../server/syllabus/coordinationReviews"
import { draftFieldBinder, type DraftFieldDeps } from "../../server/syllabus/draftField"
import { draftStartBinder, type DraftStartDeps } from "../../server/syllabus/draftStart"
import { draftValidationBinder, type DraftValidationDeps } from "../../server/syllabus/draftValidation"
import { approvalRevisionBinder, type ReviewApprovalDeps } from "../../server/syllabus/reviewApproval"
import { decisionRevisionBinder, decisionSyllabusBinder, type ReviewDecisionDeps } from "../../server/syllabus/reviewDecisions"
import { reviewDetailBinder, type ReviewDetailDeps } from "../../server/syllabus/reviewDetails"
import { submissionBinder, type SubmissionDeps } from "../../server/syllabus/submission"
import { syllabusDetailBinder, type SyllabusDetailDeps } from "../../server/syllabus/syllabusDetail"
import { bindingPreloader } from "./binding.preloader"
import {
  CONVOCATION_DEPS,
  CONVOCATION_WRITE_DEPS,
  COORDINATION_REVIEW_DEPS,
  DRAFT_FIELD_DEPS,
  DRAFT_START_DEPS,
  DRAFT_VALIDATION_DEPS,
  REVIEW_APPROVAL_DEPS,
  REVIEW_DECISION_DEPS,
  REVIEW_DETAIL_DEPS,
  SUBMISSION_DEPS,
  SYLLABUS_DETAIL_DEPS,
} from "./syllabus.tokens"

export const ConvocationPreloader = bindingPreloader<ConvocationDeps>(CONVOCATION_DEPS, (deps, params) => convocationBinder(params.convocation, deps))
export const ResumableConvocationPreloader = bindingPreloader<ConvocationWriteDeps>(CONVOCATION_WRITE_DEPS, (deps, params) => resumableConvocationBinder(params.convocation, deps))
export const ComparisonPreloader = bindingPreloader<CoordinationReviewDeps>(COORDINATION_REVIEW_DEPS, (deps, params) => comparisonBinder(params.revision, params.after, deps))
export const ReviewDetailPreloader = bindingPreloader<ReviewDetailDeps>(REVIEW_DETAIL_DEPS, (deps, params) => reviewDetailBinder(params.revision, deps))
export const DecisionRevisionPreloader = bindingPreloader<ReviewDecisionDeps>(REVIEW_DECISION_DEPS, (deps, params) => decisionRevisionBinder(params.revision, deps))
export const DecisionSyllabusPreloader = bindingPreloader<ReviewDecisionDeps>(REVIEW_DECISION_DEPS, (deps, params) => decisionSyllabusBinder(params.syllabus, deps))
export const ApprovalRevisionPreloader = bindingPreloader<ReviewApprovalDeps>(REVIEW_APPROVAL_DEPS, (deps, params) => approvalRevisionBinder(params.revision, deps))
export const SyllabusDetailPreloader = bindingPreloader<SyllabusDetailDeps>(SYLLABUS_DETAIL_DEPS, (deps, params) => syllabusDetailBinder(params.syllabus, deps))
export const DraftStartPreloader = bindingPreloader<DraftStartDeps>(DRAFT_START_DEPS, (deps, params) => draftStartBinder(params.syllabus, null, deps))
export const DraftCopyPreloader = bindingPreloader<DraftStartDeps>(DRAFT_START_DEPS, (deps, params) => draftStartBinder(params.syllabus, params.source, deps))
export const DraftFieldPreloader = bindingPreloader<DraftFieldDeps>(DRAFT_FIELD_DEPS, (deps, params) => draftFieldBinder(params.syllabus, params.field, deps))
export const DraftValidationPreloader = bindingPreloader<DraftValidationDeps>(DRAFT_VALIDATION_DEPS, (deps, params) => draftValidationBinder(params.syllabus, deps))
export const SubmissionPreloader = bindingPreloader<SubmissionDeps>(SUBMISSION_DEPS, (deps, params) => submissionBinder(params.syllabus, deps))

export const SYLLABUS_PRELOADERS = [
  ConvocationPreloader,
  ResumableConvocationPreloader,
  ComparisonPreloader,
  ReviewDetailPreloader,
  DecisionRevisionPreloader,
  DecisionSyllabusPreloader,
  ApprovalRevisionPreloader,
  SyllabusDetailPreloader,
  DraftStartPreloader,
  DraftCopyPreloader,
  DraftFieldPreloader,
  DraftValidationPreloader,
  SubmissionPreloader,
]
