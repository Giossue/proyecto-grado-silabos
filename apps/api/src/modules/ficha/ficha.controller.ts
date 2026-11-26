import { Controller, Get, Inject, Param, Post, Put, Req } from "@nestjs/common"
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiTooManyRequestsResponse, ApiUnprocessableEntityResponse } from "@nestjs/swagger"
import { MessageDto, ValidationErrorDto } from "../../common/dtos/api-responses.dto"
import type { ApiRequest } from "../../common/http/web-request"
import type { WebReply } from "../../common/http/web-reply"
import { showSubjectProfile } from "../../server/configuration/subjectProfile"
import { bulkSubjectProfiles } from "../../server/configuration/subjectProfileBulk"
import { previewSubjectProfile } from "../../server/configuration/subjectProfilePreview"
import { updateSubjectProfile } from "../../server/configuration/subjectProfileWrites"
import { applyFichaImport, fichaTemplate, previewFichaImport } from "../../server/ficha/fichaImports"
import { handled, SessionInHandler } from "../academic/academic-handler"
import { FichaDeps } from "./ficha-deps"

const VALIDATION = { description: "Errores por campo.", type: ValidationErrorDto }
const THROTTLED = { description: "Más de 20 envíos por minuto.", type: MessageDto }
const WORKBOOK = { schema: { type: "object", properties: { file: { type: "string", format: "binary" } } } }
const CAREER = { name: "career", format: "uuid", description: "Carrera sobre la que trabaja el administrador." }
const BULK = {
  schema: {
    type: "object",
    required: ["subjects", "action"],
    properties: {
      subjects: { type: "array", items: { type: "string", format: "uuid" } },
      fields: { type: "array", items: { type: "string", format: "uuid" } },
      action: { type: "string", enum: ["plantilla", "docente"] },
      confirm_purge: { type: "boolean" },
    },
  },
}
const APPLY = { schema: { type: "object", properties: { file: { type: "string", format: "binary" }, confirm_purge: { type: "boolean" } } } }

@ApiTags("Ficha de asignatura")
@SessionInHandler()
@Controller()
export class FichaController {
  constructor(@Inject(FichaDeps) private readonly deps: FichaDeps) {}

  @Get("coordination/ficha-imports/template")
  @ApiOperation({ summary: "Descarga el libro .xlsx con las fichas de las asignaturas de la carrera." })
  @ApiOkResponse({ description: "Libro .xlsx." })
  template(@Req() request: ApiRequest): Promise<WebReply> {
    return handled(request, (web) => fichaTemplate(web, this.deps.imports()))
  }

  @Post("coordination/ficha-imports/spreadsheet")
  @ApiOperation({ summary: "Revisa un libro de fichas y muestra los cambios sin guardarlos (20 por minuto)." })
  @ApiConsumes("multipart/form-data")
  @ApiBody(WORKBOOK)
  @ApiUnprocessableEntityResponse(VALIDATION)
  @ApiTooManyRequestsResponse(THROTTLED)
  preview(@Req() request: ApiRequest): Promise<WebReply> {
    return handled(request, (web) => previewFichaImport(web, this.deps.imports()))
  }

  @Post("coordination/ficha-imports/apply")
  @ApiOperation({ summary: "Guarda las fichas del libro (20 por minuto)." })
  @ApiConsumes("multipart/form-data")
  @ApiBody(APPLY)
  @ApiUnprocessableEntityResponse(VALIDATION)
  @ApiTooManyRequestsResponse(THROTTLED)
  apply(@Req() request: ApiRequest): Promise<WebReply> {
    return handled(request, (web) => applyFichaImport(web, this.deps.imports()))
  }

  @Post("coordination/subject-profiles/bulk")
  @ApiOperation({ summary: "Define a la vez los campos sin definir del proyecto de carrera de varias materias, con el texto de la plantilla o con «Texto libre» para el docente." })
  @ApiBody(BULK)
  @ApiUnprocessableEntityResponse(VALIDATION)
  bulk(@Req() request: ApiRequest): Promise<WebReply> {
    return handled(request, (web) => bulkSubjectProfiles(web, this.deps.profileWrites()))
  }

  @Get("admin/careers/:career/ficha-imports/template")
  @ApiOperation({ summary: "Descarga el libro .xlsx con las fichas de la carrera indicada (administración)." })
  @ApiParam(CAREER)
  @ApiOkResponse({ description: "Libro .xlsx." })
  adminTemplate(@Req() request: ApiRequest, @Param("career") career: string): Promise<WebReply> {
    return handled(request, (web) => fichaTemplate(web, this.deps.imports(), career))
  }

  @Post("admin/careers/:career/ficha-imports/spreadsheet")
  @ApiOperation({ summary: "Revisa un libro de fichas de la carrera indicada sin guardarlo (administración, 20 por minuto)." })
  @ApiParam(CAREER)
  @ApiConsumes("multipart/form-data")
  @ApiBody(WORKBOOK)
  @ApiUnprocessableEntityResponse(VALIDATION)
  @ApiTooManyRequestsResponse(THROTTLED)
  adminPreview(@Req() request: ApiRequest, @Param("career") career: string): Promise<WebReply> {
    return handled(request, (web) => previewFichaImport(web, this.deps.imports(), career))
  }

  @Post("admin/careers/:career/ficha-imports/apply")
  @ApiOperation({ summary: "Guarda las fichas del libro en la carrera indicada (administración, 20 por minuto)." })
  @ApiParam(CAREER)
  @ApiConsumes("multipart/form-data")
  @ApiBody(APPLY)
  @ApiUnprocessableEntityResponse(VALIDATION)
  @ApiTooManyRequestsResponse(THROTTLED)
  adminApply(@Req() request: ApiRequest, @Param("career") career: string): Promise<WebReply> {
    return handled(request, (web) => applyFichaImport(web, this.deps.imports(), career))
  }

  @Post("admin/careers/:career/subject-profiles/bulk")
  @ApiOperation({ summary: "Define a la vez los campos sin definir del proyecto de carrera en materias de la carrera indicada (administración)." })
  @ApiParam(CAREER)
  @ApiBody(BULK)
  @ApiUnprocessableEntityResponse(VALIDATION)
  adminBulk(@Req() request: ApiRequest, @Param("career") career: string): Promise<WebReply> {
    return handled(request, (web) => bulkSubjectProfiles(web, this.deps.profileWrites(), career))
  }

  @Get("academic/asignaturas/:asignatura/ficha")
  @ApiOperation({ summary: "Campos de la ficha de la asignatura con sus valores." })
  @ApiParam({ name: "asignatura", format: "uuid" })
  show(@Req() request: ApiRequest, @Param("asignatura") asignatura: string): Promise<WebReply> {
    return handled(request, (web) => showSubjectProfile(web, asignatura, this.deps.profile()))
  }

  @Put("academic/asignaturas/:asignatura/ficha")
  @ApiOperation({ summary: "Guarda la ficha de la asignatura." })
  @ApiParam({ name: "asignatura", format: "uuid" })
  @ApiUnprocessableEntityResponse(VALIDATION)
  update(@Req() request: ApiRequest, @Param("asignatura") asignatura: string): Promise<WebReply> {
    return handled(request, (web) => updateSubjectProfile(web, asignatura, this.deps.profileWrites()))
  }

  @Get("academic/asignaturas/:asignatura/ficha/vista-previa")
  @ApiOperation({ summary: "Vista previa de la ficha con los datos de la asignatura." })
  @ApiParam({ name: "asignatura", format: "uuid" })
  previewProfile(@Req() request: ApiRequest, @Param("asignatura") asignatura: string): Promise<WebReply> {
    return handled(request, (web) => previewSubjectProfile(web, asignatura, this.deps.preview()))
  }
}
