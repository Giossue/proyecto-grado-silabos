import { Controller, Get, Inject, Post, Req } from "@nestjs/common"
import { ApiBody, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiParam, ApiQuery, ApiTags, ApiUnprocessableEntityResponse } from "@nestjs/swagger"
import { COORDINATION_HISTORY_SORTS, COORDINATION_REVIEW_SORTS, SORT_DIRECTIONS } from "@silabos/shared/schemas/listSort"
import { Authenticated } from "../../common/decorators/authenticated.decorator"
import { CurrentSession, Preloaded } from "../../common/decorators/current-session.decorator"
import { MessageDto, ValidationErrorDto } from "../../common/dtos/api-responses.dto"
import type { ApiRequest } from "../../common/http/web-request"
import type { AppSession } from "../../server/auth/types"
import { compareRevisionsFor, coordinationHistoryFor, coordinationReviewsFor, type CoordinationReviewDeps, type RevisionRecord } from "../../server/syllabus/coordinationReviews"
import { approveReviewFor, type ReviewApprovalDeps } from "../../server/syllabus/reviewApproval"
import { requestCorrectionFor, resetSyllabusFor, type ReviewDecisionDeps } from "../../server/syllabus/reviewDecisions"
import { coordinationReviewDetailFor, type ReviewDetailDeps, type ReviewRevision } from "../../server/syllabus/reviewDetails"
import type { DetailSyllabus } from "../../server/syllabus/syllabusDetail"
import { ChangeRequestDto, RestartDto, SignatureDto } from "./dto/syllabus.dto"
import { respond } from "./queued-response"
import { ApprovalRevisionPreloader, ComparisonPreloader, DecisionRevisionPreloader, DecisionSyllabusPreloader, ReviewDetailPreloader } from "./syllabus.preloaders"
import { COORDINATION_REVIEW_DEPS, REVIEW_APPROVAL_DEPS, REVIEW_DECISION_DEPS, REVIEW_DETAIL_DEPS } from "./syllabus.tokens"

const VALIDATION = { description: "Errores por campo.", type: ValidationErrorDto }
const ACTIVE_ROLE = { verified: true, activeRole: "required" } as const
const MISSING_REVISION = { description: "La revisión no existe.", type: MessageDto }

type RevisionWithSyllabus = { revision: ReviewRevision; syllabus: DetailSyllabus }

@ApiTags("Coordinación: revisiones")
@Controller("coordination")
export class CoordinationReviewsController {
  constructor(
    @Inject(COORDINATION_REVIEW_DEPS) private readonly reviews: CoordinationReviewDeps,
    @Inject(REVIEW_DETAIL_DEPS) private readonly details: ReviewDetailDeps,
    @Inject(REVIEW_DECISION_DEPS) private readonly decisions: ReviewDecisionDeps,
    @Inject(REVIEW_APPROVAL_DEPS) private readonly approvals: ReviewApprovalDeps,
  ) {}

  @Get("reviews")
  @Authenticated(ACTIVE_ROLE)
  @ApiQuery({ name: "search", required: false })
  @ApiQuery({ name: "sort", required: false, enum: COORDINATION_REVIEW_SORTS })
  @ApiQuery({ name: "dir", required: false, enum: SORT_DIRECTIONS })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiOkResponse({ description: "Sílabos enviados de la carrera, de 20 en 20." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  list(@Req() request: ApiRequest, @CurrentSession() session: AppSession) {
    return respond(request, (web) => coordinationReviewsFor(web, session, this.reviews))
  }

  @Get("history")
  @Authenticated(ACTIVE_ROLE)
  @ApiQuery({ name: "q", required: false })
  @ApiQuery({ name: "period", required: false, format: "uuid" })
  @ApiQuery({ name: "sort", required: false, enum: COORDINATION_HISTORY_SORTS })
  @ApiQuery({ name: "dir", required: false, enum: SORT_DIRECTIONS })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiOkResponse({ description: "Sílabos aprobados de la carrera y sus períodos, de 20 en 20." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  history(@Req() request: ApiRequest, @CurrentSession() session: AppSession) {
    return respond(request, (web) => coordinationHistoryFor(web, session, this.reviews))
  }

  @Get("reviews/:revision")
  @Authenticated({ ...ACTIVE_ROLE, preload: ReviewDetailPreloader })
  @ApiParam({ name: "revision", format: "uuid" })
  @ApiOkResponse({ description: "Revisión con la fotografía firmada, el historial, las firmas y la decisión disponible." })
  @ApiNotFoundResponse(MISSING_REVISION)
  detail(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() bound: RevisionWithSyllabus) {
    return respond(request, (web) => coordinationReviewDetailFor(web, session, bound, this.details))
  }

  @Get("reviews/:revision/compare/:after")
  @Authenticated({ ...ACTIVE_ROLE, preload: ComparisonPreloader })
  @ApiParam({ name: "revision", format: "uuid" })
  @ApiParam({ name: "after", format: "uuid" })
  @ApiOkResponse({ description: "Diferencias entre dos revisiones del mismo sílabo." })
  @ApiNotFoundResponse(MISSING_REVISION)
  @ApiUnprocessableEntityResponse(VALIDATION)
  compare(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() bound: { before: RevisionRecord; after: RevisionRecord }) {
    return respond(request, () => compareRevisionsFor(session, bound, this.reviews))
  }

  @Post("reviews/:revision/request-correction")
  @Authenticated({ ...ACTIVE_ROLE, preload: DecisionRevisionPreloader })
  @ApiParam({ name: "revision", format: "uuid" })
  @ApiBody({ type: ChangeRequestDto })
  @ApiOkResponse({ description: "Devuelve el sílabo al docente con la justificación.", type: MessageDto })
  @ApiForbiddenResponse({ description: "Sin permiso o con la decisión bloqueada.", type: MessageDto })
  @ApiNotFoundResponse(MISSING_REVISION)
  @ApiUnprocessableEntityResponse(VALIDATION)
  requestCorrection(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() bound: RevisionWithSyllabus) {
    return respond(request, (web) => requestCorrectionFor(web, { session, ...bound }, this.decisions))
  }

  @Post("reviews/:revision/approve")
  @Authenticated({ ...ACTIVE_ROLE, preload: ApprovalRevisionPreloader })
  @ApiParam({ name: "revision", format: "uuid" })
  @ApiBody({ type: SignatureDto })
  @ApiOkResponse({ description: "Firma y aprueba la revisión vigente y pide el PDF.", type: MessageDto })
  @ApiForbiddenResponse({ description: "Sin permiso o con la decisión bloqueada.", type: MessageDto })
  @ApiNotFoundResponse(MISSING_REVISION)
  @ApiUnprocessableEntityResponse(VALIDATION)
  approve(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() bound: RevisionWithSyllabus) {
    return respond(request, (web) => approveReviewFor(web, { session, ...bound }, this.approvals))
  }

  @Post("syllabi/:syllabus/reset")
  @Authenticated({ ...ACTIVE_ROLE, preload: DecisionSyllabusPreloader })
  @ApiParam({ name: "syllabus", format: "uuid" })
  @ApiBody({ type: RestartDto })
  @ApiOkResponse({ description: "Reinicia un sílabo aprobado conservando su historial.", type: MessageDto })
  @ApiForbiddenResponse({ description: "Sin permiso o con la decisión bloqueada.", type: MessageDto })
  @ApiNotFoundResponse({ description: "El sílabo no existe.", type: MessageDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  reset(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() syllabus: DetailSyllabus) {
    return respond(request, (web) => resetSyllabusFor(web, session, syllabus, this.decisions))
  }
}
