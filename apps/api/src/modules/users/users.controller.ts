import { Controller, Delete, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common"
import {
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from "@nestjs/swagger"
import { MANAGED_USER_SORTS } from "@silabos/shared/schemas/listSort"
import { MANAGED_USER_STATUSES, ROLE_CODES } from "@silabos/shared/schemas/people"
import { SESSION_COOKIE } from "../../common/decorators/authenticated.decorator"
import { MessageDto, ValidationErrorDto } from "../../common/dtos/api-responses.dto"
import type { ApiRequest } from "../../common/http/web-request"
import type { WebReply } from "../../common/http/web-reply"
import { destroyManagedUser, removeManagedUserRole, resendManagedUserActivation, storeManagedUser, updateManagedUser } from "../../server/identity/accountWrites"
import { importUsers, userImportTemplate } from "../../server/identity/imports"
import { managedUsers } from "../../server/identity/managedUsers"
import { IdentityDeps } from "../auth/identity.deps"
import { identityReply } from "../auth/identity-reply"
import { ManagedUserDto, NewManagedUserDto } from "./dto/users.dto"
import { UsersDeps } from "./users.deps"

const VALIDATION = { description: "Errores por campo.", type: ValidationErrorDto }
const GUEST = { description: "Sin sesión: { \"message\": \"Unauthenticated.\" }" }
const FORBIDDEN = { description: "Solo con el rol de administrador activo y la cuenta verificada.", type: MessageDto }
const ROLE_REQUIRED = { description: "Seleccione un rol vigente.", type: MessageDto }
const MISSING_USER = { description: "La cuenta no existe: «No query results for model [App\\Models\\User] …»", type: MessageDto }

@ApiTags("Usuarios")
@ApiCookieAuth(SESSION_COOKIE)
@ApiUnauthorizedResponse(GUEST)
@ApiForbiddenResponse(FORBIDDEN)
@ApiConflictResponse(ROLE_REQUIRED)
@Controller("admin/users")
export class UsersController {
  constructor(
    @Inject(IdentityDeps) private readonly identity: IdentityDeps,
    @Inject(UsersDeps) private readonly deps: UsersDeps,
  ) {}

  @Get()
  @ApiOperation({ summary: "Lista las cuentas, de 20 en 20, con sus roles, filtros y carreras activas." })
  @ApiQuery({ name: "q", required: false })
  @ApiQuery({ name: "status", required: false, enum: MANAGED_USER_STATUSES })
  @ApiQuery({ name: "role", required: false, enum: ROLE_CODES })
  @ApiQuery({ name: "career", required: false, format: "uuid" })
  @ApiQuery({ name: "sort", required: false, enum: MANAGED_USER_SORTS })
  @ApiQuery({ name: "dir", required: false, enum: ["asc", "desc"] })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiOkResponse({ description: "Cuentas paginadas." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  list(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => managedUsers(web, this.deps.set.managedUsers))
  }

  @Post()
  @ApiOperation({ summary: "Crea una cuenta con su rol inicial y envía la invitación de activación." })
  @ApiBody({ type: NewManagedUserDto })
  @ApiCreatedResponse({ description: "Cuenta creada." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  store(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => storeManagedUser(web, this.identity.set.writes))
  }

  @Post("import")
  @ApiOperation({ summary: "Importa cuentas desde una hoja de cálculo (todo o nada)." })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: { type: "object", properties: { archivo: { type: "string", format: "binary" } } } })
  @ApiOkResponse({ description: "Resultado de la importación por fila." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  import(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => importUsers(web, this.deps.set.imports))
  }

  @Get("import-template")
  @ApiOperation({ summary: "Descarga la plantilla de importación de cuentas." })
  @ApiProduces("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  @ApiOkResponse({ description: "Plantilla .xlsx." })
  importTemplate(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => userImportTemplate(web, this.deps.set.imports))
  }

  @Patch(":user")
  @ApiParam({ name: "user", format: "uuid" })
  @ApiOperation({ summary: "Actualiza nombre, correo, rol o estado de una cuenta." })
  @ApiBody({ type: ManagedUserDto })
  @ApiOkResponse({ description: "Cuenta actualizada.", type: MessageDto })
  @ApiNotFoundResponse(MISSING_USER)
  @ApiUnprocessableEntityResponse(VALIDATION)
  update(@Req() request: ApiRequest, @Param("user") user: string): Promise<WebReply> {
    return identityReply(request, (web) => updateManagedUser(web, user, this.identity.set.writes))
  }

  @Delete(":user")
  @ApiParam({ name: "user", format: "uuid" })
  @ApiOperation({ summary: "Elimina una cuenta pendiente de activación." })
  @ApiOkResponse({ description: "Cuenta eliminada.", type: MessageDto })
  @ApiNotFoundResponse(MISSING_USER)
  @ApiUnprocessableEntityResponse(VALIDATION)
  destroy(@Req() request: ApiRequest, @Param("user") user: string): Promise<WebReply> {
    return identityReply(request, (web) => destroyManagedUser(web, user, this.identity.set.writes))
  }

  @Post(":user/resend-activation")
  @ApiParam({ name: "user", format: "uuid" })
  @ApiOperation({ summary: "Reenvía la invitación de activación de una cuenta pendiente." })
  @ApiOkResponse({ description: "Invitación enviada.", type: MessageDto })
  @ApiNotFoundResponse(MISSING_USER)
  @ApiUnprocessableEntityResponse(VALIDATION)
  @ApiTooManyRequestsResponse({ description: "Demasiados reenvíos; trae X-RateLimit-*.", type: MessageDto })
  resendActivation(@Req() request: ApiRequest, @Param("user") user: string): Promise<WebReply> {
    return identityReply(request, (web) => resendManagedUserActivation(web, user, this.identity.set.writes))
  }

  @Delete(":user/roles/:assignment")
  @ApiParam({ name: "user", format: "uuid" })
  @ApiParam({ name: "assignment", format: "uuid" })
  @ApiOperation({ summary: "Retira un rol de la cuenta." })
  @ApiOkResponse({ description: "Rol retirado.", type: MessageDto })
  @ApiNotFoundResponse({ description: "La cuenta o el rol no existen." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  removeRole(@Req() request: ApiRequest, @Param("user") user: string, @Param("assignment") assignment: string): Promise<WebReply> {
    return identityReply(request, (web) => removeManagedUserRole(web, user, assignment, this.identity.set.writes))
  }
}
