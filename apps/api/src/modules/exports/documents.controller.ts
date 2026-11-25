import { Controller, Get, Inject, Post, Req } from "@nestjs/common"
import { ApiAcceptedResponse, ApiBody, ApiNotFoundResponse, ApiOkResponse, ApiParam, ApiProduces, ApiTags, ApiTooManyRequestsResponse, ApiUnprocessableEntityResponse } from "@nestjs/swagger"
import { Authenticated } from "../../common/decorators/authenticated.decorator"
import { CurrentSession, Preloaded } from "../../common/decorators/current-session.decorator"
import { MessageDto, ValidationErrorDto } from "../../common/dtos/api-responses.dto"
import type { ApiRequest } from "../../common/http/web-request"
import type { AppSession } from "../../server/auth/types"
import {
  DOCUMENT_REQUEST_LIMIT,
  downloadExportFor,
  requestRevisionDocumentsFor,
  revisionDocumentsFor,
  type ArtifactBound,
  type DocumentDeps,
  type DocumentRequestDeps,
  type RevisionBound,
} from "../../server/documents/revisionDocuments"
import { IdempotencyDto } from "../syllabus/dto/syllabus.dto"
import { respond } from "../syllabus/queued-response"
import { DocumentRequestPreloader, ExportPreloader, RevisionDocumentsPreloader } from "./exports.preloaders"
import { DOCUMENT_DEPS, DOCUMENT_REQUEST_DEPS } from "./exports.tokens"

const ACTIVE_ROLE = { verified: true, activeRole: "required" } as const

@ApiTags("Documentos del sílabo")
@Controller()
export class DocumentsController {
  constructor(
    @Inject(DOCUMENT_DEPS) private readonly documents: DocumentDeps,
    @Inject(DOCUMENT_REQUEST_DEPS) private readonly requests: DocumentRequestDeps,
  ) {}

  @Get("revisions/:revision/documents")
  @Authenticated({ ...ACTIVE_ROLE, preload: RevisionDocumentsPreloader })
  @ApiParam({ name: "revision", format: "uuid" })
  @ApiOkResponse({ description: "Aprobación de la revisión y sus PDF generados." })
  @ApiNotFoundResponse({ description: "La revisión no existe o no está aprobada.", type: MessageDto })
  list(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() bound: RevisionBound) {
    return respond(request, () => revisionDocumentsFor(session, bound, this.documents))
  }

  @Post("revisions/:revision/documents")
  @Authenticated({ ...ACTIVE_ROLE, rateLimit: DOCUMENT_REQUEST_LIMIT, preload: DocumentRequestPreloader })
  @ApiParam({ name: "revision", format: "uuid" })
  @ApiBody({ type: IdempotencyDto })
  @ApiAcceptedResponse({ description: "Pide el PDF de la revisión aprobada (idempotente por clave)." })
  @ApiNotFoundResponse({ description: "La revisión no existe.", type: MessageDto })
  @ApiUnprocessableEntityResponse({ description: "Errores por campo.", type: ValidationErrorDto })
  @ApiTooManyRequestsResponse({ description: "Más de 20 solicitudes por minuto.", type: MessageDto })
  request(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() bound: RevisionBound) {
    return respond(request, (web) => requestRevisionDocumentsFor(web, session, bound, this.requests))
  }

  @Get("exports/:artifact/pdf")
  @Authenticated({ ...ACTIVE_ROLE, preload: ExportPreloader })
  @ApiParam({ name: "artifact", format: "uuid" })
  @ApiProduces("application/pdf")
  @ApiOkResponse({ description: "PDF del sílabo aprobado." })
  @ApiNotFoundResponse({ description: "El PDF no existe.", type: MessageDto })
  download(@Req() request: ApiRequest, @CurrentSession() session: AppSession, @Preloaded() bound: ArtifactBound) {
    return respond(request, () => downloadExportFor(session, bound))
  }
}
