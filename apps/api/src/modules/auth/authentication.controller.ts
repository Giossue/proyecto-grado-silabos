import { Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Req } from "@nestjs/common"
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
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from "@nestjs/swagger"
import { SESSION_COOKIE } from "../../common/decorators/authenticated.decorator"
import { MessageDto, ValidationErrorDto } from "../../common/dtos/api-responses.dto"
import type { ApiRequest } from "../../common/http/web-request"
import type { WebReply } from "../../common/http/web-reply"
import { login, logout, updatePassword } from "../../server/identity/authentication"
import { activateAccount, resetPassword, sendResetLink } from "../../server/identity/passwordRecovery"
import { destroyOtherSessions, destroySession, resendOwnActivation, updateAccessibility, updateFormation, updateProfile } from "../../server/identity/selfService"
import { twoFactorStatus } from "../../server/identity/session"
import { activeSessions } from "../../server/identity/sessions"
import { confirmTwoFactor, disableTwoFactor, enableTwoFactor, regenerateRecoveryCodes, twoFactorChallenge } from "../../server/identity/twoFactor"
import {
  AccessibilityDto,
  AccountActivationDto,
  LoginDto,
  PasswordConfirmationDto,
  PasswordResetDto,
  PasswordUpdateDto,
  ProfileDto,
  RecoveryLinkDto,
  TeacherFormationDto,
  TwoFactorChallengeDto,
  TwoFactorConfirmationDto,
  TwoFactorDisableDto,
} from "./dto/authentication.dto"
import { IdentityDeps } from "./identity.deps"
import { identityReply } from "./identity-reply"

const VALIDATION = { description: "Errores por campo.", type: ValidationErrorDto }
const GUEST = { description: "Sin sesión: { \"message\": \"Unauthenticated.\" }" }
const OUTSIDE_WEB_APP = { description: "La petición no viene de la aplicación web: «Inicie sesión desde la aplicación web.»", type: MessageDto }
const THROTTLED = { description: "Demasiados intentos; trae Retry-After y X-RateLimit-*.", type: MessageDto }

@ApiTags("Autenticación")
@Controller("authentication")
export class AuthenticationController {
  constructor(@Inject(IdentityDeps) private readonly deps: IdentityDeps) {}

  @Post("login")
  @HttpCode(200)
  @ApiOperation({ summary: "Inicia sesión con correo y contraseña; deja la cookie de sesión de Better Auth." })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: "Sesión iniciada: usuario, rol activo, roles disponibles y datos de la institución." })
  @ApiAcceptedResponse({ description: "Falta el segundo paso: { two_factor_required: true }." })
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
  @ApiUnauthorizedResponse(GUEST)
  logout(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => logout(web, this.deps.set.authentication))
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

  @Put("password")
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: "Cambia la contraseña y cierra las demás sesiones." })
  @ApiBody({ type: PasswordUpdateDto })
  @ApiOkResponse({ description: "Sesión con la nueva cookie." })
  @ApiUnauthorizedResponse(GUEST)
  @ApiUnprocessableEntityResponse(VALIDATION)
  updatePassword(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => updatePassword(web, this.deps.set.authentication))
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

  @Put("formation")
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: "Guarda la formación y experiencia del docente." })
  @ApiBody({ type: TeacherFormationDto })
  @ApiOkResponse({ description: "Sesión actualizada." })
  @ApiUnauthorizedResponse(GUEST)
  @ApiConflictResponse({ description: "Seleccione un rol vigente.", type: MessageDto })
  @ApiUnprocessableEntityResponse(VALIDATION)
  updateFormation(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => updateFormation(web, this.deps.set.writes))
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

  @Get("sessions")
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: "Lista las sesiones abiertas de la cuenta." })
  @ApiOkResponse({ description: "Sesiones con dispositivo, IP, última actividad y cuál es la actual." })
  @ApiUnauthorizedResponse(GUEST)
  sessions(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => activeSessions(web, this.deps.set.activeSessions))
  }

  @Delete("sessions/others")
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: "Cierra las demás sesiones tras confirmar la contraseña actual." })
  @ApiBody({ type: PasswordConfirmationDto })
  @ApiOkResponse({ description: "Número de sesiones cerradas." })
  @ApiUnauthorizedResponse(GUEST)
  @ApiUnprocessableEntityResponse(VALIDATION)
  destroyOtherSessions(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => destroyOtherSessions(web, this.deps.set.writes))
  }

  @Delete("sessions/:session")
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiParam({ name: "session" })
  @ApiOperation({ summary: "Cierra una sesión distinta de la actual." })
  @ApiOkResponse({ description: "Sesión cerrada.", type: MessageDto })
  @ApiUnauthorizedResponse(GUEST)
  @ApiUnprocessableEntityResponse({ description: "La sesión actual se cierra desde «Cerrar sesión».", type: MessageDto })
  destroySession(@Req() request: ApiRequest, @Param("session") session: string): Promise<WebReply> {
    return identityReply(request, (web) => destroySession(web, session, this.deps.set.writes))
  }

  @Get("two-factor")
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: "Estado de la verificación en dos pasos." })
  @ApiOkResponse({ description: "{ enabled, confirmation_required }" })
  @ApiUnauthorizedResponse(GUEST)
  twoFactorStatus(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => twoFactorStatus(web, this.deps.set.session))
  }

  @Post("two-factor")
  @HttpCode(200)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: "Genera el secreto TOTP (QR y clave) tras confirmar la contraseña." })
  @ApiBody({ type: PasswordConfirmationDto })
  @ApiOkResponse({ description: "Código QR, clave y códigos de recuperación." })
  @ApiUnauthorizedResponse(GUEST)
  @ApiUnprocessableEntityResponse(VALIDATION)
  enableTwoFactor(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => enableTwoFactor(web, this.deps.set.twoFactor))
  }

  @Delete("two-factor")
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: "Desactiva la verificación en dos pasos." })
  @ApiBody({ type: TwoFactorDisableDto })
  @ApiOkResponse({ description: "Estado actualizado." })
  @ApiUnauthorizedResponse(GUEST)
  @ApiUnprocessableEntityResponse(VALIDATION)
  @ApiTooManyRequestsResponse(THROTTLED)
  disableTwoFactor(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => disableTwoFactor(web, this.deps.set.twoFactor))
  }

  @Post("two-factor/confirm")
  @HttpCode(200)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: "Confirma el secreto TOTP con un código de la aplicación." })
  @ApiBody({ type: TwoFactorConfirmationDto })
  @ApiOkResponse({ description: "Estado actualizado." })
  @ApiUnauthorizedResponse(GUEST)
  @ApiUnprocessableEntityResponse(VALIDATION)
  confirmTwoFactor(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => confirmTwoFactor(web, this.deps.set.twoFactor))
  }

  @Post("two-factor/recovery-codes")
  @HttpCode(200)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: "Genera códigos de recuperación nuevos tras confirmar la contraseña." })
  @ApiBody({ type: PasswordConfirmationDto })
  @ApiOkResponse({ description: "Códigos de recuperación." })
  @ApiUnauthorizedResponse(GUEST)
  @ApiUnprocessableEntityResponse(VALIDATION)
  regenerateRecoveryCodes(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => regenerateRecoveryCodes(web, this.deps.set.twoFactor))
  }

  @Post("two-factor/challenge")
  @HttpCode(200)
  @ApiOperation({ summary: "Completa el ingreso con el código TOTP o un código de recuperación; un código TOTP no se acepta dos veces." })
  @ApiBody({ type: TwoFactorChallengeDto })
  @ApiOkResponse({ description: "Sesión iniciada." })
  @ApiBadRequestResponse(OUTSIDE_WEB_APP)
  @ApiUnprocessableEntityResponse(VALIDATION)
  @ApiTooManyRequestsResponse(THROTTLED)
  twoFactorChallenge(@Req() request: ApiRequest): Promise<WebReply> {
    return identityReply(request, (web) => twoFactorChallenge(web, this.deps.set.twoFactor))
  }
}
