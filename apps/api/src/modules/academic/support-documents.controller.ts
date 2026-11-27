import { Controller, Delete, Get, Inject, Param, Post, Req } from "@nestjs/common"
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiTooManyRequestsResponse, ApiUnprocessableEntityResponse } from "@nestjs/swagger"
import { MessageDto, ValidationErrorDto } from "../../common/dtos/api-responses.dto"
import type { ApiRequest } from "../../common/http/web-request"
import type { WebReply } from "../../common/http/web-reply"
import { coordinationSupportDocuments } from "../../server/academic/supportDocuments"
import { destroySupportDocument, storeSupportDocument, updateSupportDocument, viewSupportDocument } from "../../server/academic/supportDocumentWrites"
import { handled, SessionInHandler } from "./academic-handler"
import { AcademicDeps } from "./academic-deps"

const UPLOAD = { schema: { type: "object", properties: { title: { type: "string", maxLength: 180 }, file: { type: "string", format: "binary" } } } }

@ApiTags("Documentos de apoyo")
@SessionInHandler()
@Controller()
export class SupportDocumentsController {
  constructor(@Inject(AcademicDeps) private readonly deps: AcademicDeps) {}

  @Get("coordination/support-documents")
  @ApiOperation({ summary: "Documentos de apoyo de la carrera." })
  list(@Req() request: ApiRequest): Promise<WebReply> {
    return handled(request, (web) => coordinationSupportDocuments(web, this.deps.supportDocuments()))
  }

  @Post("coordination/support-documents")
  @ApiOperation({ summary: "Sube un documento de apoyo (20 por minuto) y encola su vista PDF." })
  @ApiConsumes("multipart/form-data")
  @ApiBody(UPLOAD)
  @ApiUnprocessableEntityResponse({ description: "Errores por campo.", type: ValidationErrorDto })
  @ApiTooManyRequestsResponse({ description: "Más de 20 subidas por minuto.", type: MessageDto })
  upload(@Req() request: ApiRequest): Promise<WebReply> {
    return handled(request, (web) => storeSupportDocument(web, this.deps.supportDocumentWrites()))
  }

  @Post("coordination/support-documents/:document")
  @ApiOperation({ summary: "Cambia el nombre del documento y, si se envía, reemplaza su archivo (20 por minuto)." })
  @ApiParam({ name: "document", format: "uuid" })
  @ApiConsumes("multipart/form-data")
  @ApiBody(UPLOAD)
  @ApiUnprocessableEntityResponse({ description: "Errores por campo.", type: ValidationErrorDto })
  @ApiTooManyRequestsResponse({ description: "Más de 20 subidas por minuto.", type: MessageDto })
  update(@Req() request: ApiRequest, @Param("document") document: string): Promise<WebReply> {
    return handled(request, (web) => updateSupportDocument(web, document, this.deps.supportDocumentWrites()))
  }

  @Delete("coordination/support-documents/:document")
  @ApiOperation({ summary: "Elimina el documento y sus archivos." })
  @ApiParam({ name: "document", format: "uuid" })
  remove(@Req() request: ApiRequest, @Param("document") document: string): Promise<WebReply> {
    return handled(request, (web) => destroySupportDocument(web, document, this.deps.supportDocumentWrites()))
  }

  @Get("support-documents/:document/view")
  @ApiOperation({ summary: "Muestra la vista PDF del documento a la coordinación o a los docentes de la carrera." })
  @ApiParam({ name: "document", format: "uuid" })
  @ApiOkResponse({ description: "PDF en línea." })
  view(@Req() request: ApiRequest, @Param("document") document: string): Promise<WebReply> {
    return handled(request, (web) => viewSupportDocument(web, document, this.deps.supportDocumentWrites()))
  }
}
