import { Body, Controller, Get, HttpCode, Inject, Post, Put } from "@nestjs/common"
import { ApiBody, ApiConflictResponse, ApiOkResponse, ApiTags, ApiTooManyRequestsResponse, ApiUnprocessableEntityResponse } from "@nestjs/swagger"
import { Authenticated } from "../../common/decorators/authenticated.decorator"
import { CurrentSession } from "../../common/decorators/current-session.decorator"
import { Roles } from "../../common/decorators/roles.decorator"
import { MessageDto, ValidationErrorDto } from "../../common/dtos/api-responses.dto"
import type { AppSession } from "../../server/auth/types"
import type { PhpArray } from "../../server/http/input"
import { AiSettingsDto, LibrarySettingsDto, NotificationSettingsDto } from "./dto/system-settings.dto"
import { SettingsService } from "./settings.service"

const ADMINISTRATOR = "administrador"
const THROTTLED = { verified: true, activeRole: "required", rateLimit: { name: "throttle:10,1", maxAttempts: 10, decaySeconds: 60 } } as const
const SAVED = { description: "Guarda la sección y devuelve los ajustes con su origen (pantalla o entorno); la clave de IA solo indica si está configurada." }
const VALIDATION = { description: "Errores por campo; la contraseña actual se pide en IA y biblioteca.", type: ValidationErrorDto }
const THROTTLE = { description: "Más de 10 cambios o pruebas por minuto.", type: MessageDto }
const ROLE_REQUIRED = { description: "Falta elegir un rol vigente.", type: MessageDto }
const TESTED = { description: "Resultado de la prueba de conexión: { ok, message }." }

@ApiTags("Ajustes del sistema")
@Controller("admin/system-settings")
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}

  @Get()
  @Authenticated({ verified: true, activeRole: "required" })
  @Roles(ADMINISTRATOR)
  @ApiOkResponse({ description: "Ajustes de avisos, IA y biblioteca con su origen (pantalla o entorno)." })
  @ApiConflictResponse(ROLE_REQUIRED)
  show() {
    return this.settings.show()
  }

  @Put("notificaciones")
  @Authenticated(THROTTLED)
  @ApiBody({ type: NotificationSettingsDto })
  @ApiOkResponse(SAVED)
  @ApiUnprocessableEntityResponse(VALIDATION)
  @ApiTooManyRequestsResponse(THROTTLE)
  saveNotifications(@CurrentSession() session: AppSession, @Body() input: PhpArray) {
    return this.settings.save(session, "notificaciones", input)
  }

  @Put("ia")
  @Authenticated(THROTTLED)
  @ApiBody({ type: AiSettingsDto })
  @ApiOkResponse(SAVED)
  @ApiUnprocessableEntityResponse(VALIDATION)
  @ApiTooManyRequestsResponse(THROTTLE)
  saveAi(@CurrentSession() session: AppSession, @Body() input: PhpArray) {
    return this.settings.save(session, "ia", input)
  }

  @Put("biblioteca")
  @Authenticated(THROTTLED)
  @ApiBody({ type: LibrarySettingsDto })
  @ApiOkResponse(SAVED)
  @ApiUnprocessableEntityResponse(VALIDATION)
  @ApiTooManyRequestsResponse(THROTTLE)
  saveLibrary(@CurrentSession() session: AppSession, @Body() input: PhpArray) {
    return this.settings.save(session, "biblioteca", input)
  }

  @Post("ia/test")
  @HttpCode(200)
  @Authenticated(THROTTLED)
  @ApiOkResponse(TESTED)
  @ApiTooManyRequestsResponse(THROTTLE)
  testAi(@CurrentSession() session: AppSession) {
    return this.settings.test(session, "ia")
  }

  @Post("biblioteca/test")
  @HttpCode(200)
  @Authenticated(THROTTLED)
  @ApiOkResponse(TESTED)
  @ApiTooManyRequestsResponse(THROTTLE)
  testLibrary(@CurrentSession() session: AppSession) {
    return this.settings.test(session, "biblioteca")
  }
}
