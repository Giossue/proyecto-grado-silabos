import type { Provider } from "@nestjs/common"
import { defaultCatalogDeps, searchCatalog } from "../../server/library/catalogHandlers"
import { teacherSupportDocuments } from "../../server/academic/supportDocuments"
import { defaultTeacherAssistantRouteDeps } from "../../server/ai/teacherAssistantRoutes"
import type { BridgeDeps } from "../../server/auth/types"
import { defaultConvocationWriteDeps } from "../../server/syllabus/convocationWrites"
import { defaultConvocationDeps } from "../../server/syllabus/convocations"
import { defaultCoordinationReviewDeps } from "../../server/syllabus/coordinationReviews"
import { defaultDraftFieldDeps } from "../../server/syllabus/draftField"
import { defaultDraftStartDeps } from "../../server/syllabus/draftStart"
import { defaultDraftValidationDeps } from "../../server/syllabus/draftValidation"
import { defaultReviewApprovalDeps } from "../../server/syllabus/reviewApproval"
import { defaultReviewDecisionDeps } from "../../server/syllabus/reviewDecisions"
import { defaultReviewDetailDeps } from "../../server/syllabus/reviewDetails"
import { defaultSubmissionDeps } from "../../server/syllabus/submission"
import { defaultSyllabusDetailDeps } from "../../server/syllabus/syllabusDetail"
import { defaultTeacherSyllabusDeps } from "../../server/syllabus/teacherSyllabi"
import { PrismaService } from "../../prisma/prisma.service"
import { AcademicDeps } from "../academic/academic-deps"
import { AUTH_BRIDGE } from "../auth/auth.tokens"
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
  TEACHER_ASSISTANT_DEPS,
  TEACHER_RESOURCES,
  TEACHER_SYLLABUS_DEPS,
} from "./syllabus.tokens"

export type TeacherResources = {
  supportDocuments(request: Request): Promise<Response>
  catalogSearch(request: Request): Promise<Response>
}

function withBridge(token: symbol, defaults: (prisma: PrismaService) => { bridge: BridgeDeps }): Provider {
  return { provide: token, useFactory: (bridge: BridgeDeps, prisma: PrismaService) => ({ ...defaults(prisma), bridge }), inject: [AUTH_BRIDGE, PrismaService] }
}

export const SYLLABUS_DEPS_PROVIDERS: Provider[] = [
  withBridge(CONVOCATION_DEPS, defaultConvocationDeps),
  withBridge(CONVOCATION_WRITE_DEPS, defaultConvocationWriteDeps),
  withBridge(COORDINATION_REVIEW_DEPS, defaultCoordinationReviewDeps),
  withBridge(REVIEW_DETAIL_DEPS, defaultReviewDetailDeps),
  withBridge(REVIEW_DECISION_DEPS, defaultReviewDecisionDeps),
  withBridge(REVIEW_APPROVAL_DEPS, defaultReviewApprovalDeps),
  withBridge(TEACHER_SYLLABUS_DEPS, defaultTeacherSyllabusDeps),
  withBridge(SYLLABUS_DETAIL_DEPS, defaultSyllabusDetailDeps),
  withBridge(DRAFT_START_DEPS, defaultDraftStartDeps),
  withBridge(DRAFT_FIELD_DEPS, defaultDraftFieldDeps),
  withBridge(DRAFT_VALIDATION_DEPS, defaultDraftValidationDeps),
  withBridge(SUBMISSION_DEPS, defaultSubmissionDeps),
  {
    provide: TEACHER_ASSISTANT_DEPS,
    useFactory: (bridge: BridgeDeps, prisma: PrismaService) => defaultTeacherAssistantRouteDeps(prisma, bridge),
    inject: [AUTH_BRIDGE, PrismaService],
  },
  {
    provide: TEACHER_RESOURCES,
    useFactory: (academic: AcademicDeps, prisma: PrismaService): TeacherResources => ({
      supportDocuments: (request: Request) => teacherSupportDocuments(request, academic.supportDocuments()),
      catalogSearch: (request: Request) => searchCatalog(request, defaultCatalogDeps(prisma)),
    }),
    inject: [AcademicDeps, PrismaService],
  },
]
