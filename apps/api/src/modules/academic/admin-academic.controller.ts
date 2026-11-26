import { Controller, Delete, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common"
import { ApiBody, ApiConsumes, ApiExtraModels, ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnprocessableEntityResponse, getSchemaPath } from "@nestjs/swagger"
import { ValidationErrorDto } from "../../common/dtos/api-responses.dto"
import type { ApiRequest } from "../../common/http/web-request"
import type { WebReply } from "../../common/http/web-reply"
import { deleteGovernanceRecord } from "../../server/academic/deletions"
import { academicGovernance } from "../../server/academic/governance"
import { createGovernanceRecord, postGovernanceRecord, setGovernanceStatus, updateGovernanceRecord } from "../../server/academic/governanceWrites"
import { careerImportTemplate, importCareers } from "../../server/academic/structureImports"
import { catalogLibraries } from "../../server/library/catalogHandlers"
import { handled, SessionInHandler, unmatched, UnmatchedMethods } from "./academic-handler"
import { AcademicDeps } from "./academic-deps"
import { FacultyDto, PeriodDto, StatusDto } from "./dto/academic.dto"

const VALIDATION = { description: "Errores por campo.", type: ValidationErrorDto }
const GOVERNANCE_BODY = { schema: { oneOf: [{ $ref: getSchemaPath(FacultyDto) }, { $ref: getSchemaPath(PeriodDto) }] } }
const ENTITY = { name: "entity", description: "facultad, carrera o periodo (en la lectura: facultades, carreras o periodos-academicos)." }
const SPREADSHEET = { schema: { type: "object", properties: { file: { type: "string", format: "binary" }, confirm: { type: "boolean" } } } }

@ApiTags("Estructura académica (administración)")
@ApiExtraModels(FacultyDto, PeriodDto)
@SessionInHandler()
@Controller("admin")
export class AdminAcademicController {
  constructor(@Inject(AcademicDeps) private readonly deps: AcademicDeps) {}

  @Post("academic/careers/import")
  @ApiOperation({ summary: "Importa carreras desde una hoja .xlsx (10 por minuto)." })
  @ApiConsumes("multipart/form-data")
  @ApiBody(SPREADSHEET)
  @ApiUnprocessableEntityResponse(VALIDATION)
  importCareers(@Req() request: ApiRequest): Promise<WebReply> {
    return handled(request, (web) => importCareers(web, this.deps.structureImports()))
  }

  @Patch("academic/careers/import")
  @ApiOperation({ summary: "Edita la carrera con identificador «import»: responde como la ruta de edición." })
  updateCareerImport(@Req() request: ApiRequest): Promise<WebReply> {
    return handled(request, (web) => updateGovernanceRecord(web, "careers", "import", this.deps.governanceWrites()))
  }

  @Delete("academic/careers/import")
  @ApiOperation({ summary: "Elimina el registro «import»: responde como la ruta de eliminación." })
  deleteCareerImport(@Req() request: ApiRequest): Promise<WebReply> {
    return handled(request, (web) => deleteGovernanceRecord(web, "careers", "import", this.deps.deletions()))
  }

  @UnmatchedMethods("academic/careers/import")
  careerImportOthers(@Req() request: ApiRequest): Promise<WebReply> {
    return unmatched(request)
  }

  @Get("academic/careers/import-template")
  @ApiOperation({ summary: "Descarga la plantilla .xlsx para importar carreras." })
  @ApiOkResponse({ description: "Libro .xlsx." })
  careerImportTemplate(@Req() request: ApiRequest): Promise<WebReply> {
    return handled(request, (web) => careerImportTemplate(web, this.deps.structureImports()))
  }

  @Patch("academic/careers/import-template")
  @ApiOperation({ summary: "Edita el registro «import-template»: responde como la ruta de edición." })
  updateCareerImportTemplate(@Req() request: ApiRequest): Promise<WebReply> {
    return handled(request, (web) => updateGovernanceRecord(web, "careers", "import-template", this.deps.governanceWrites()))
  }

  @Delete("academic/careers/import-template")
  @ApiOperation({ summary: "Elimina el registro «import-template»: responde como la ruta de eliminación." })
  deleteCareerImportTemplate(@Req() request: ApiRequest): Promise<WebReply> {
    return handled(request, (web) => deleteGovernanceRecord(web, "careers", "import-template", this.deps.deletions()))
  }

  @UnmatchedMethods("academic/careers/import-template")
  careerImportTemplateOthers(@Req() request: ApiRequest): Promise<WebReply> {
    return unmatched(request)
  }

  @Get("library-catalog/libraries")
  @ApiOperation({ summary: "Bibliotecas del catálogo Koha (30 consultas por minuto)." })
  libraries(@Req() request: ApiRequest): Promise<WebReply> {
    return handled(request, (web) => catalogLibraries(web, this.deps.catalog()))
  }

  @Get("academic")
  @ApiOperation({ summary: "Facultades, carreras y períodos académicos con sus bloqueos." })
  governance(@Req() request: ApiRequest): Promise<WebReply> {
    return handled(request, (web) => academicGovernance(web, null, this.deps.governance()))
  }

  @Get("academic/:entity")
  @ApiOperation({ summary: "Lo mismo que /admin/academic, con la sección indicada." })
  @ApiParam(ENTITY)
  section(@Req() request: ApiRequest, @Param("entity") entity: string): Promise<WebReply> {
    return handled(request, (web) => academicGovernance(web, entity, this.deps.governance()))
  }

  @Post("academic/:entity")
  @ApiOperation({ summary: "Crea una facultad (con logo PNG opcional), una carrera o un período." })
  @ApiParam(ENTITY)
  @ApiConsumes("application/json", "multipart/form-data")
  @ApiBody(GOVERNANCE_BODY)
  @ApiUnprocessableEntityResponse(VALIDATION)
  create(@Req() request: ApiRequest, @Param("entity") entity: string): Promise<WebReply> {
    return handled(request, (web) => createGovernanceRecord(web, entity, this.deps.governanceWrites()))
  }

  @Patch("academic/:entity/:record/status")
  @ApiOperation({ summary: "Activa o desactiva una facultad o una carrera." })
  @ApiParam(ENTITY)
  @ApiParam({ name: "record", format: "uuid" })
  @ApiBody({ type: StatusDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  status(@Req() request: ApiRequest, @Param("entity") entity: string, @Param("record") record: string): Promise<WebReply> {
    return handled(request, (web) => setGovernanceStatus(web, entity, record, this.deps.governanceWrites()))
  }

  @Post("academic/:entity/:record")
  @ApiOperation({ summary: "Edición o eliminación con _method (PATCH o DELETE), para enviar un logo." })
  @ApiParam(ENTITY)
  @ApiParam({ name: "record", format: "uuid" })
  @ApiConsumes("multipart/form-data")
  spoofed(@Req() request: ApiRequest, @Param("entity") entity: string, @Param("record") record: string): Promise<WebReply> {
    return handled(request, (web) => postGovernanceRecord(web, entity, record, this.deps.governanceWrites()))
  }

  @Patch("academic/:entity/:record")
  @ApiOperation({ summary: "Edita una facultad, una carrera o un período." })
  @ApiParam(ENTITY)
  @ApiParam({ name: "record", format: "uuid" })
  @ApiBody(GOVERNANCE_BODY)
  @ApiUnprocessableEntityResponse(VALIDATION)
  update(@Req() request: ApiRequest, @Param("entity") entity: string, @Param("record") record: string): Promise<WebReply> {
    return handled(request, (web) => updateGovernanceRecord(web, entity, record, this.deps.governanceWrites()))
  }

  @Delete("academic/:entity/:record")
  @ApiOperation({ summary: "Elimina un período sin periodo académico; las facultades y carreras se desactivan." })
  @ApiParam(ENTITY)
  @ApiParam({ name: "record", format: "uuid" })
  remove(@Req() request: ApiRequest, @Param("entity") entity: string, @Param("record") record: string): Promise<WebReply> {
    return handled(request, (web) => deleteGovernanceRecord(web, entity, record, this.deps.deletions()))
  }
}
