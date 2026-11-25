import { applyDecorators, SetMetadata, UseGuards } from "@nestjs/common"
import { ApiCookieAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from "@nestjs/swagger"
import { RolesGuard } from "../guards/roles.guard"
import { SessionGuard } from "../guards/session.guard"
import { AUTHENTICATED, type AuthenticatedOptions } from "./authenticated.options"

export const SESSION_COOKIE = "silabos-ueb.session_token"

export function Authenticated(options: AuthenticatedOptions = {}) {
  return applyDecorators(
    SetMetadata(AUTHENTICATED, options),
    UseGuards(SessionGuard, RolesGuard),
    ApiCookieAuth(SESSION_COOKIE),
    ApiUnauthorizedResponse({ description: "Sin sesión: { \"message\": \"Unauthenticated.\" }" }),
    ApiForbiddenResponse({ description: "Sin permiso o cuenta no verificada." }),
  )
}
