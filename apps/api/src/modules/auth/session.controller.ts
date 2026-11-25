import { Controller, Delete, Get, Inject, Put, Req } from "@nestjs/common"
import { ApiBody, ApiCookieAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse, ApiUnprocessableEntityResponse } from "@nestjs/swagger"
import { SESSION_COOKIE } from "../../common/decorators/authenticated.decorator"
import { MessageDto, ValidationErrorDto } from "../../common/dtos/api-responses.dto"
import type { ApiRequest } from "../../common/http/web-request"
import type { WebReply } from "../../common/http/web-reply"
import { leaveActiveRole, selectActiveRole } from "../../server/identity/authentication"
import { showSession } from "../../server/identity/session"
import { ActiveRoleDto } from "./dto/authentication.dto"
import { IdentityDeps } from "./identity.deps"
import { identityReply } from "./identity-reply"

const GUEST = { description: "Sin sesión: { \"message\": \"Unauthenticated.\" }" }

@ApiTags("Sesión")
@ApiCookieAuth(SESSION_COOKIE)
@Controller()
export class SessionController {
  constructor(@Inject(IdentityDeps) private readonly deps: IdentityDeps) {}

  @Get("session")
  @ApiOperation({ summary: "Sesión actual: usuario, rol activo, roles disponibles y datos de la institución." })
  @ApiOkResponse({ description: "Sesión actual." })
  @ApiUnauthorizedResponse(GUEST)
  @ApiForbiddenResponse({ description: "La cuenta está desactivada.", type: MessageDto })
  show(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => showSession(web, this.deps.set.session))
  }

  @Put("active-role")
  @ApiOperation({ summary: "Cambia el rol activo de la sesión." })
  @ApiBody({ type: ActiveRoleDto })
  @ApiOkResponse({ description: "Sesión con el rol elegido." })
  @ApiUnauthorizedResponse(GUEST)
  @ApiNotFoundResponse({ description: "El rol no existe o no está vigente." })
  @ApiUnprocessableEntityResponse({ description: "Errores por campo.", type: ValidationErrorDto })
  select(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => selectActiveRole(web, this.deps.set.authentication))
  }

  @Delete("active-role")
  @ApiOperation({ summary: "Deja la sesión sin rol activo." })
  @ApiOkResponse({ description: "Sesión sin rol activo." })
  @ApiUnauthorizedResponse(GUEST)
  leave(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => leaveActiveRole(web, this.deps.set.authentication))
  }
}
