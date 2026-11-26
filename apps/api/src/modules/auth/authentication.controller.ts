import { Controller, HttpCode, Inject, Optional, Post, Put, Req } from "@nestjs/common"
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from "@nestjs/swagger"
import { SESSION_COOKIE } from "../../common/decorators/authenticated.decorator"
import { MessageDto, ValidationErrorDto } from "../../common/dtos/api-responses.dto"
import type { ApiRequest } from "../../common/http/web-request"
import type { WebReply } from "../../common/http/web-reply"
import { login, logout } from "../../server/identity/authentication"
import { activateAccount, resetPassword, sendResetLink } from "../../server/identity/passwordRecovery"
import { resendOwnActivation, updateAccessibility, updateProfile } from "../../server/identity/selfService"
import {
  AccessibilityDto,
  AccountActivationDto,
  LoginDto,
  PasswordResetDto,
  ProfileDto,
  RecoveryLinkDto,
} from "./dto/authentication.dto"
import { KeycloakService } from "../keycloak/keycloak.service"
import { IdentityDeps } from "./identity.deps"
import { identityReply } from "./identity-reply"

const VALIDATION = { description: "Errores por campo.", type: ValidationErrorDto }
const GUEST = { description: "Sin sesión: { \"message\": \"Unauthenticated.\" }" }
const OUTSIDE_WEB_APP = { description: "La petición no viene de la aplicación web: «Inicie sesión desde la aplicación web.»", type: MessageDto }
const THROTTLED = { description: "Demasiados intentos; trae Retry-After y X-RateLimit-*.", type: MessageDto }

@ApiTags("Autenticación")
@Controller("authentication")
export class AuthenticationController {
  constructor(
    @Inject(IdentityDeps) private readonly deps: IdentityDeps,
    @Optional() @Inject(KeycloakService) private readonly keycloak?: KeycloakService,
  ) {}

  @Post("login")
  @HttpCode(200)
  @ApiOperation({ summary: "Inicia sesión con correo y contraseña; deja la cookie de sesión de Better Auth." })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: "Sesión iniciada: usuario, rol activo, roles disponibles y datos de la institución." })
  @ApiBadRequestResponse(OUTSIDE_WEB_APP)
  @ApiUnprocessableEntityResponse({ description: "Credenciales no válidas o errores por campo.", type: ValidationErrorDto })
  @ApiTooManyRequestsResponse(THROTTLED)
  login(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => login(web, this.deps.set.authentication))
  }

  @Post("logout")
  @HttpCode(204)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: "Cierra la sesión actual y borra la cookie." })
  @ApiNoContentResponse({ description: "Sesión cerrada." })
  @ApiOkResponse({ description: "Sesión cerrada que vino de Keycloak: { logout_url } para cerrar también la sesión institucional." })
  @ApiUnauthorizedResponse(GUEST)
  logout(@Req() request: ApiRequest): Promise<WebReply> {
    const run = (web: Request) => logout(web, this.deps.set.authentication)
    return identityReply(request, (web) => (this.keycloak ? this.keycloak.logout(web, () => run(web)) : run(web)))
  }

  @Post("account-activation")
  @HttpCode(200)
  @ApiOperation({ summary: "Activa la cuenta con el enlace de la invitación y fija la contraseña." })
  @ApiBody({ type: AccountActivationDto })
  @ApiOkResponse({ description: "Cuenta activada.", type: MessageDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  @ApiTooManyRequestsResponse(THROTTLED)
  activateAccount(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => activateAccount(web, this.deps.set.recovery))
  }

  @Post("account-activation/resend")
  @HttpCode(202)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: "Reenvía el enlace de activación a la cuenta en sesión si aún no está activada." })
  @ApiAcceptedResponse({ description: "Respuesta única, haya o no envío.", type: MessageDto })
  @ApiUnauthorizedResponse(GUEST)
  @ApiTooManyRequestsResponse(THROTTLED)
  resendActivation(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => resendOwnActivation(web, this.deps.set.writes))
  }

  @Post("password-recovery")
  @HttpCode(200)
  @ApiOperation({ summary: "Envía el enlace para restablecer la contraseña; la respuesta es la misma exista o no la cuenta." })
  @ApiBody({ type: RecoveryLinkDto })
  @ApiOkResponse({ description: "Respuesta única.", type: MessageDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  @ApiTooManyRequestsResponse(THROTTLED)
  sendResetLink(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => sendResetLink(web, this.deps.set.recovery))
  }

  @Post("password-reset")
  @HttpCode(200)
  @ApiOperation({ summary: "Restablece la contraseña con el enlace recibido y cierra todas las sesiones." })
  @ApiBody({ type: PasswordResetDto })
  @ApiOkResponse({ description: "Contraseña restablecida.", type: MessageDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  @ApiTooManyRequestsResponse(THROTTLED)
  resetPassword(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => resetPassword(web, this.deps.set.recovery))
  }

  @Put("profile")
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: "Actualiza nombre y correo propios (solo con el rol de administrador activo)." })
  @ApiBody({ type: ProfileDto })
  @ApiOkResponse({ description: "Sesión actualizada." })
  @ApiUnauthorizedResponse(GUEST)
  @ApiForbiddenResponse({ description: "Sin permiso o cuenta no verificada.", type: MessageDto })
  @ApiConflictResponse({ description: "Seleccione un rol vigente.", type: MessageDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  updateProfile(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => updateProfile(web, this.deps.set.writes))
  }

  @Put("accessibility")
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: "Guarda las preferencias de accesibilidad." })
  @ApiBody({ type: AccessibilityDto })
  @ApiOkResponse({ description: "Sesión con las preferencias guardadas." })
  @ApiUnauthorizedResponse(GUEST)
  @ApiUnprocessableEntityResponse(VALIDATION)
  updateAccessibility(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => updateAccessibility(web, this.deps.set.writes))
  }
}
