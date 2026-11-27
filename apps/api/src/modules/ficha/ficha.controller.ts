import { Controller, Get, Inject, Param, Post, Put, Req } from "@nestjs/common"
import { ApiBody, ApiOperation, ApiParam, ApiTags, ApiUnprocessableEntityResponse } from "@nestjs/swagger"
import { ValidationErrorDto } from "../../common/dtos/api-responses.dto"
import type { ApiRequest } from "../../common/http/web-request"
import type { WebReply } from "../../common/http/web-reply"
import { showSubjectProfile } from "../../server/configuration/subjectProfile"
import { applySubjectProfileBulk, showSubjectProfileBulk } from "../../server/configuration/subjectProfileBulk"
import { previewSubjectProfile } from "../../server/configuration/subjectProfilePreview"
import { updateSubjectProfile } from "../../server/configuration/subjectProfileWrites"
import { handled, SessionInHandler } from "../academic/academic-handler"
import { FichaDeps } from "./ficha-deps"

const VALIDATION = { description: "Errores por campo.", type: ValidationErrorDto }
const CAREER = { name: "career", format: "uuid", description: "Carrera sobre la que trabaja el administrador." }
const FILL = {
  schema: {
    type: "object",
    required: ["field_id", "value", "subjects"],
    properties: {
      field_id: { type: "string", format: "uuid" },
      value: { type: "object", description: "Documento del campo, el mismo que se guarda en la materia." },
      subjects: { type: "array", items: { type: "string", format: "uuid" } },
      replace: { type: "array", items: { type: "string", format: "uuid" }, description: "Materias marcadas que ya tienen contenido y se reemplazan." },
      confirm_purge: { type: "boolean" },
    },
  },
}

@ApiTags("Ficha de asignatura")
@SessionInHandler()
@Controller()
export class FichaController {
  constructor(@Inject(FichaDeps) private readonly deps: FichaDeps) {}

  @Get("coordination/ficha-bulk")
  @ApiOperation({ summary: "Campos de la carrera y las materias que ya tienen algo en cada uno." })
  bulkFields(@Req() request: ApiRequest): Promise<WebReply> {
    return handled(request, (web) => showSubjectProfileBulk(web, this.deps.bulk()))
  }

  @Post("coordination/ficha-bulk")
  @ApiOperation({ summary: "Llena un campo en varias materias; las que ya tienen algo cambian solo si van en «replace»." })
  @ApiBody(FILL)
  @ApiUnprocessableEntityResponse(VALIDATION)
  bulkFill(@Req() request: ApiRequest): Promise<WebReply> {
    return handled(request, (web) => applySubjectProfileBulk(web, this.deps.bulk()))
  }

  @Get("admin/careers/:career/ficha-bulk")
  @ApiOperation({ summary: "Campos de la carrera indicada y las materias que ya tienen algo en cada uno (administración)." })
  @ApiParam(CAREER)
  adminBulkFields(@Req() request: ApiRequest, @Param("career") career: string): Promise<WebReply> {
    return handled(request, (web) => showSubjectProfileBulk(web, this.deps.bulk(), career))
  }

  @Post("admin/careers/:career/ficha-bulk")
  @ApiOperation({ summary: "Llena un campo en varias materias de la carrera indicada (administración)." })
  @ApiParam(CAREER)
  @ApiBody(FILL)
  @ApiUnprocessableEntityResponse(VALIDATION)
  adminBulkFill(@Req() request: ApiRequest, @Param("career") career: string): Promise<WebReply> {
    return handled(request, (web) => applySubjectProfileBulk(web, this.deps.bulk(), career))
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
