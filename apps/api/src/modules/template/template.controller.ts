import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put } from "@nestjs/common"
import { ApiBody, ApiConsumes, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiParam, ApiTags, ApiTooManyRequestsResponse, ApiUnprocessableEntityResponse } from "@nestjs/swagger"
import { Authenticated } from "../../common/decorators/authenticated.decorator"
import { Preloaded } from "../../common/decorators/current-session.decorator"
import { Roles } from "../../common/decorators/roles.decorator"
import { MessageDto, ValidationErrorDto } from "../../common/dtos/api-responses.dto"
import type { StructureTarget } from "../../server/configuration/templateStructure"
import type { PhpArray } from "../../server/http/input"
import { OfficialFormatDto } from "./dto/official-format.dto"
import { TemplateFieldPreloader, TemplatePreloader } from "./template.preloader"
import { TemplateService } from "./template.service"
import { PhpInput, WebRequest } from "./web-request.decorator"

const ADMIN = "administrador"
const SESSION = { verified: true, activeRole: "required" } as const
const BOUND = { ...SESSION, preload: TemplatePreloader }
const VALIDATION = { description: "Errores por campo; también «Proceso activo» mientras hay una convocatoria abierta.", type: ValidationErrorDto }
const MISSING = { description: "La plantilla, la sección o el campo no existe.", type: MessageDto }

@ApiTags("Plantilla")
@Controller("admin/template")
export class TemplateController {
  constructor(@Inject(TemplateService) private readonly templates: TemplateService) {}

  @Get()
  @Authenticated(SESSION)
  @Roles(ADMIN)
  @ApiOkResponse({ description: "Editor de la plantilla institucional, o `template: null` si todavía no existe." })
  index(@WebRequest() request: Request) {
    return this.templates.index(request)
  }

  @Post()
  @Authenticated(SESSION)
  @Roles(ADMIN)
  @ApiCreatedResponse({ description: "Crea la plantilla vacía o con el formato oficial." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  create(@WebRequest() request: Request, @Body() _format: OfficialFormatDto, @PhpInput() input: PhpArray) {
    return this.templates.create(request, input)
  }

  @Get(":template")
  @Authenticated(BOUND)
  @Roles(ADMIN)
  @ApiOkResponse({ description: "Editor de la plantilla institucional." })
  @ApiNotFoundResponse(MISSING)
  show(@WebRequest() request: Request, @Preloaded() target: StructureTarget) {
    return this.templates.show(request, target)
  }

  @Get(":template/teacher-preview")
  @Authenticated(BOUND)
  @Roles(ADMIN)
  @ApiOkResponse({ description: "Secciones como las ve el docente, con datos de ejemplo." })
  @ApiNotFoundResponse(MISSING)
  teacherPreview(@Preloaded() target: StructureTarget) {
    return this.templates.teacherPreview(target)
  }

  @Get(":template/json")
  @Authenticated(BOUND)
  @Roles(ADMIN)
  @ApiOkResponse({ description: "Exporta la plantilla en JSON canónico (plantilla.schema.json)." })
  @ApiNotFoundResponse(MISSING)
  exportJson(@WebRequest() request: Request, @Preloaded() target: StructureTarget) {
    return this.templates.exportJson(request, target)
  }

  @Put(":template/json")
  @Authenticated(BOUND)
  @Roles(ADMIN)
  @ApiBody({ description: "Documento JSON de la plantilla (máximo 2 MB en UTF-8)." })
  @ApiOkResponse({ description: "Reemplaza la plantilla con el JSON importado.", type: MessageDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  importJson(@WebRequest() request: Request, @PhpInput() input: PhpArray, @Preloaded() target: StructureTarget) {
    return this.templates.importJson(request, input, target)
  }

  @Post(":template/logo")
  @Authenticated(BOUND)
  @Roles(ADMIN)
  @ApiConsumes("multipart/form-data")
  @ApiOkResponse({ description: "Guarda el logo institucional (PNG) y devuelve su URL." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  uploadLogo(@WebRequest() request: Request) {
    return this.templates.uploadLogo(request)
  }

  @Post(":template/format")
  @Authenticated(BOUND)
  @Roles(ADMIN)
  @ApiOkResponse({ description: "Restablece la plantilla al formato oficial.", type: MessageDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  format(@WebRequest() request: Request, @Preloaded() target: StructureTarget) {
    return this.templates.format(request, target)
  }

  @Post(":template/blocks/design")
  @Authenticated(BOUND)
  @Roles(ADMIN)
  @ApiOkResponse({ description: "Valida y arma la definición de una tabla repetible." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  designTable(@PhpInput() input: PhpArray, @Preloaded() target: StructureTarget) {
    return this.templates.designTable(input, target)
  }

  @Post(":template/draft/check")
  @Authenticated({ ...BOUND, rateLimit: { name: "throttle:120,1", maxAttempts: 120, decaySeconds: 60 } })
  @Roles(ADMIN)
  @ApiOkResponse({ description: "Problemas del borrador del editor." })
  @ApiTooManyRequestsResponse({ description: "Más de 120 revisiones por minuto.", type: MessageDto })
  checkDraft(@PhpInput() input: PhpArray, @Preloaded() target: StructureTarget) {
    return this.templates.checkDraft(input, target)
  }

  @Post(":template/draft/impact")
  @Authenticated(BOUND)
  @Roles(ADMIN)
  @ApiOkResponse({ description: "Sílabos en curso afectados por el borrador." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  draftImpact(@PhpInput() input: PhpArray, @Preloaded() target: StructureTarget) {
    return this.templates.draftImpact(input, target)
  }

  @Post(":template/draft/preview")
  @Authenticated(BOUND)
  @Roles(ADMIN)
  @ApiOkResponse({ description: "Vista previa del borrador sin guardarlo." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  previewDraft(@PhpInput() input: PhpArray, @Preloaded() target: StructureTarget) {
    return this.templates.previewDraft(input, target)
  }

  @Delete(":template/structure")
  @Authenticated(BOUND)
  @Roles(ADMIN)
  @ApiOkResponse({ description: "Vacía la plantilla.", type: MessageDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  clear(@WebRequest() request: Request, @Preloaded() target: StructureTarget) {
    return this.templates.clear(request, target)
  }

  @Post(":template/structure/sections")
  @Authenticated(BOUND)
  @Roles(ADMIN)
  @ApiCreatedResponse({ description: "Agrega una sección." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  storeSection(@PhpInput() input: PhpArray, @Preloaded() target: StructureTarget) {
    return this.templates.storeSection(input, target)
  }

  @Patch(":template/structure/sections/order")
  @Authenticated(BOUND)
  @Roles(ADMIN)
  @ApiOkResponse({ description: "Ordena las secciones.", type: MessageDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  reorderSections(@PhpInput() input: PhpArray, @Preloaded() target: StructureTarget) {
    return this.templates.reorderSections(input, target)
  }

  @Delete(":template/structure/sections/order")
  @Authenticated(BOUND)
  @Roles(ADMIN)
  @ApiNotFoundResponse(MISSING)
  destroyOrderSection(@Preloaded() target: StructureTarget) {
    return this.templates.destroySection(target, "order")
  }

  @Patch(":template/structure/sections/:section")
  @Authenticated(BOUND)
  @Roles(ADMIN)
  @ApiParam({ name: "section", format: "uuid" })
  @ApiOkResponse({ description: "Cambia el título o la orientación de la sección.", type: MessageDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  @ApiNotFoundResponse(MISSING)
  updateSection(@PhpInput() input: PhpArray, @Preloaded() target: StructureTarget, @Param("section") section: string) {
    return this.templates.updateSection(input, target, section)
  }

  @Delete(":template/structure/sections/:section")
  @Authenticated(BOUND)
  @Roles(ADMIN)
  @ApiParam({ name: "section", format: "uuid" })
  @ApiOkResponse({ description: "Elimina la sección.", type: MessageDto })
  @ApiNotFoundResponse(MISSING)
  destroySection(@Preloaded() target: StructureTarget, @Param("section") section: string) {
    return this.templates.destroySection(target, section)
  }

  @Post(":template/structure/sections/:section/fields")
  @Authenticated(BOUND)
  @Roles(ADMIN)
  @ApiParam({ name: "section", format: "uuid" })
  @ApiCreatedResponse({ description: "Agrega un campo a la sección." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  @ApiNotFoundResponse(MISSING)
  storeField(@PhpInput() input: PhpArray, @Preloaded() target: StructureTarget, @Param("section") section: string) {
    return this.templates.storeField(input, target, section)
  }

  @Patch(":template/structure/sections/:section/fields/order")
  @Authenticated(BOUND)
  @Roles(ADMIN)
  @ApiParam({ name: "section", format: "uuid" })
  @ApiOkResponse({ description: "Ordena los campos de la sección.", type: MessageDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  @ApiNotFoundResponse(MISSING)
  reorderFields(@PhpInput() input: PhpArray, @Preloaded() target: StructureTarget, @Param("section") section: string) {
    return this.templates.reorderFields(input, target, section)
  }

  @Patch(":template/structure/fields/:field")
  @Authenticated({ ...SESSION, preload: TemplateFieldPreloader })
  @Roles(ADMIN)
  @ApiParam({ name: "field", format: "uuid" })
  @ApiOkResponse({ description: "Cambia el campo." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  @ApiNotFoundResponse(MISSING)
  updateField(@PhpInput() input: PhpArray, @Preloaded() target: StructureTarget) {
    return this.templates.updateField(input, target)
  }

  @Delete(":template/structure/fields/:field")
  @Authenticated({ ...SESSION, preload: TemplateFieldPreloader })
  @Roles(ADMIN)
  @ApiParam({ name: "field", format: "uuid" })
  @ApiOkResponse({ description: "Elimina el campo.", type: MessageDto })
  @ApiNotFoundResponse(MISSING)
  destroyField(@Preloaded() target: StructureTarget) {
    return this.templates.destroyField(target)
  }
}
