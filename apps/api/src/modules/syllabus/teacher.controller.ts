import { Controller, Get, Inject, Patch, Post, Req, UseGuards } from "@nestjs/common"
import { ApiBody, ApiConflictResponse, ApiNotFoundResponse, ApiOkResponse, ApiParam, ApiQuery, ApiTags, ApiTooManyRequestsResponse, ApiUnprocessableEntityResponse } from "@nestjs/swagger"
import { Authenticated } from "../../common/decorators/authenticated.decorator"
import { CurrentSession, Preloaded } from "../../common/decorators/current-session.decorator"
import { MessageDto, ValidationErrorDto } from "../../common/dtos/api-responses.dto"
import type { ApiRequest } from "../../common/http/web-request"
import type { AppSession } from "../../server/auth/types"
import { updateDraftFieldFor, type DraftFieldDeps, type DraftFieldRecord, type DraftSyllabus } from "../../server/syllabus/draftField"
import { copySyllabusContentFor, startDraftFor, type DraftStartDeps } from "../../server/syllabus/draftStart"
import { validateDraftFor, type DraftValidationDeps } from "../../server/syllabus/draftValidation"
import { submissionStatementFor, submitSyllabusFor, type SubmissionDeps } from "../../server/syllabus/submission"
import { teacherSyllabusDetailFor, type DetailSyllabus, type SyllabusDetailDeps } from "../../server/syllabus/syllabusDetail"
import { teacherHistoryCareerFor, teacherHistoryFor, teacherSyllabiFor, type TeacherSyllabusDeps } from "../../server/syllabus/teacherSyllabi"
import { DraftFieldDto, LockVersionDto, SubmissionDto } from "./dto/syllabus.dto"
import { respond } from "./queued-response"
import { RouteAllowsGuard } from "./route-allows.guard"
import { DraftCopyPreloader, DraftFieldPreloader, DraftStartPreloader, DraftValidationPreloader, SubmissionPreloader, SyllabusDetailPreloader } from "./syllabus.preloaders"
import type { TeacherResources } from "./syllabus.providers"
import {
  DRAFT_FIELD_DEPS,
  DRAFT_START_DEPS,
  DRAFT_VALIDATION_DEPS,
  SUBMISSION_DEPS,
  SYLLABUS_DETAIL_DEPS,
  TEACHER_RESOURCES,
  TEACHER_SYLLABUS_DEPS,
} from "./syllabus.tokens"

const VALIDATION = { description: "Errores por campo.", type: ValidationErrorDto }
const ACTIVE_ROLE = { verified: true, activeRole: "required" } as const
const MISSING_SYLLABUS = { description: "El sílabo no existe.", type: MessageDto }
const DRAFT_CONFLICT = { description: "El borrador cambió en otra sesión (versión de edición distinta).", type: MessageDto }
const SYLLABUS_STATES = ["all", "sin_iniciar", "borrador", "en_revision", "correccion_solicitada", "aprobado"]

@ApiTags("Docente")
@Controller("teacher")
export class TeacherController {
  constructor(
    @Inject(TEACHER_SYLLABUS_DEPS) private readonly syllabi: TeacherSyllabusDeps,
    @Inject(SYLLABUS_DETAIL_DEPS) private readonly details: SyllabusDetailDeps,
    @Inject(DRAFT_START_DEPS) private readonly starts: DraftStartDeps,
    @Inject(DRAFT_FIELD_DEPS) private readonly fields: DraftFieldDeps,
    @Inject(DRAFT_VALIDATION_DEPS) private readonly validations: DraftValidationDeps,
    @Inject(SUBMISSION_DEPS) private readonly submissions: SubmissionDeps,
    @Inject(TEACHER_RESOURCES) private readonly resources: TeacherResources,
  ) {}

  @Get("syllabi")
  @Authenticated(ACTIVE_ROLE)
  @ApiQuery({ name: "q", required: false })
  @ApiQuery({ name: "state", required: false, enum: SYLLABUS_STATES })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiOkResponse({ description: "Sílabos del período vigente del docente, de 20 en 20." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  list(@Req() request: ApiRequest, @CurrentSession() session: AppSession) {
    return respond(request, (web) => teacherSyllabiFor(web, session, this.syllabi))
  }

  @Get("syllabi/:syllabus")
  @Authenticated({ ...ACTIVE_ROLE, preload: SyllabusDetailPreloader })
  @ApiParam({ name: "syllabus", format: "uuid" })
  @ApiOkResponse({ description: "Sílabo con la plantilla, las respuestas, la ficha y el estado de edición." })
  @ApiNotFoundResponse(MISSING_SYLLABUS)
  detail(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() syllabus: DetailSyllabus) {
    return respond(request, (web) => teacherSyllabusDetailFor(web, session, syllabus, this.details))
  }

  @Post("syllabi/:syllabus/start")
  @Authenticated({ ...ACTIVE_ROLE, preload: DraftStartPreloader })
  @ApiParam({ name: "syllabus", format: "uuid" })
  @ApiOkResponse({ description: "Inicia el borrador y hereda las respuestas del período anterior cuando corresponde." })
  @ApiNotFoundResponse(MISSING_SYLLABUS)
  @ApiUnprocessableEntityResponse(VALIDATION)
  start(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() bound: { syllabus: DetailSyllabus; source: null }) {
    return respond(request, (web) => startDraftFor(web, { session, ...bound }, this.starts))
  }

  @Post("syllabi/:syllabus/copy-from/:source")
  @Authenticated({ ...ACTIVE_ROLE, preload: DraftCopyPreloader })
  @ApiParam({ name: "syllabus", format: "uuid" })
  @ApiParam({ name: "source", format: "uuid" })
  @ApiBody({ type: LockVersionDto })
  @ApiOkResponse({ description: "Copia las respuestas de otro sílabo del docente." })
  @ApiNotFoundResponse(MISSING_SYLLABUS)
  @ApiConflictResponse(DRAFT_CONFLICT)
  @ApiUnprocessableEntityResponse(VALIDATION)
  copyFrom(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() bound: { syllabus: DetailSyllabus; source: DetailSyllabus }) {
    return respond(request, (web) => copySyllabusContentFor(web, { session, ...bound }, this.starts))
  }

  @Patch("syllabi/:syllabus/fields/:field")
  @Authenticated({ ...ACTIVE_ROLE, preload: DraftFieldPreloader })
  @ApiParam({ name: "syllabus", format: "uuid" })
  @ApiParam({ name: "field", format: "uuid" })
  @ApiBody({ type: DraftFieldDto })
  @ApiOkResponse({ description: "Guarda la respuesta de un campo (autoguardado) y devuelve la nueva versión de edición." })
  @ApiNotFoundResponse({ description: "El sílabo o el campo no existe.", type: MessageDto })
  @ApiConflictResponse(DRAFT_CONFLICT)
  @ApiUnprocessableEntityResponse(VALIDATION)
  updateField(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() bound: { syllabus: DraftSyllabus; field: DraftFieldRecord }) {
    return respond(request, (web) => updateDraftFieldFor(web, { session, ...bound }, this.fields))
  }

  @Post("syllabi/:syllabus/validate")
  @Authenticated({ ...ACTIVE_ROLE, preload: DraftValidationPreloader })
  @ApiParam({ name: "syllabus", format: "uuid" })
  @ApiOkResponse({ description: "Observaciones del borrador antes del envío." })
  @ApiNotFoundResponse(MISSING_SYLLABUS)
  validate(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() syllabus: DraftSyllabus) {
    return respond(request, () => validateDraftFor(session, syllabus, this.validations))
  }

  @Post("syllabi/:syllabus/signing-statement")
  @Authenticated({ ...ACTIVE_ROLE, preload: SubmissionPreloader })
  @ApiParam({ name: "syllabus", format: "uuid" })
  @ApiBody({ type: LockVersionDto })
  @ApiOkResponse({ description: "Texto que firma el docente (con el SHA-256 de la fotografía) y si la firma es obligatoria." })
  @ApiNotFoundResponse(MISSING_SYLLABUS)
  @ApiConflictResponse(DRAFT_CONFLICT)
  @ApiUnprocessableEntityResponse(VALIDATION)
  signingStatement(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() syllabus: DetailSyllabus) {
    return respond(request, (web) => submissionStatementFor(web, { session, syllabus }, this.submissions))
  }

  @Post("syllabi/:syllabus/submit")
  @Authenticated({ ...ACTIVE_ROLE, preload: SubmissionPreloader })
  @ApiParam({ name: "syllabus", format: "uuid" })
  @ApiBody({ type: SubmissionDto })
  @ApiOkResponse({ description: "Envía el sílabo firmado a revisión con su fotografía canónica." })
  @ApiNotFoundResponse(MISSING_SYLLABUS)
  @ApiConflictResponse(DRAFT_CONFLICT)
  @ApiUnprocessableEntityResponse(VALIDATION)
  submit(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() syllabus: DetailSyllabus) {
    return respond(request, (web) => submitSyllabusFor(web, { session, syllabus }, this.submissions))
  }

  @Get("history")
  @Authenticated(ACTIVE_ROLE)
  @ApiOkResponse({ description: "Carreras con sílabos del docente en períodos anteriores." })
  history(@Req() request: ApiRequest, @CurrentSession() session: AppSession) {
    return respond(request, (web) => teacherHistoryFor(web, session, this.syllabi))
  }

  @Get("history/:career")
  @Authenticated(ACTIVE_ROLE)
  @UseGuards(RouteAllowsGuard)
  @ApiParam({ name: "career", format: "uuid" })
  @ApiOkResponse({ description: "Sílabos anteriores del docente en una carrera." })
  @ApiNotFoundResponse({ description: "Sin sílabos anteriores en esa carrera." })
  historyCareer(@Req() request: ApiRequest, @CurrentSession() session: AppSession) {
    return respond(request, (web) => teacherHistoryCareerFor(web, session, String(request.params.career), this.syllabi))
  }

  @Get("support-documents")
  @ApiOkResponse({ description: "Documentos de apoyo de la carrera del rol activo." })
  supportDocuments(@Req() request: ApiRequest) {
    return respond(request, (web) => this.resources.supportDocuments(web))
  }

  @Get("library-catalog/search")
  @ApiOkResponse({ description: "Búsqueda en el catálogo de la biblioteca para la bibliografía." })
  @ApiTooManyRequestsResponse({ description: "Demasiadas búsquedas por minuto.", type: MessageDto })
  catalogSearch(@Req() request: ApiRequest) {
    return respond(request, (web) => this.resources.catalogSearch(web))
  }
}
