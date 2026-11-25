import { Body, Controller, Get, HttpCode, Inject, Post, Put, UseInterceptors } from "@nestjs/common"
import { ApiNotFoundResponse, ApiOkResponse, ApiParam, ApiQuery, ApiTags, ApiTooManyRequestsResponse, ApiUnprocessableEntityResponse } from "@nestjs/swagger"
import { Authenticated } from "../../common/decorators/authenticated.decorator"
import { MessageDto, ValidationErrorDto } from "../../common/dtos/api-responses.dto"
import { CurrentSession, Preloaded } from "../../common/decorators/current-session.decorator"
import { EmailNoticeRoles } from "../../common/decorators/email-notice-roles.decorator"
import { PageContext, type PageLinks, QueryInput } from "../../common/decorators/query-input.decorator"
import { NOTIFICATION_STATUSES } from "@silabos/shared/schemas/notifications"
import type { AppSession } from "../../server/auth/types"
import type { StoredNotification } from "../../server/operations/notifications"
import { EmailPreferencesDto } from "./dto/email-preferences.dto"
import { NotificationListQueryDto } from "./dto/notification-list-query.dto"
import { EmailNoticeScopeInterceptor } from "./email-notice-scope.interceptor"
import { NotificationPreloader } from "./notification.preloader"
import { NotificationsService } from "./notifications.service"

const VALIDATION = { description: "Errores por campo.", type: ValidationErrorDto }

@ApiTags("Notificaciones")
@Controller("notifications")
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  @Get()
  @Authenticated({ verified: true, activeRole: "optional" })
  @ApiQuery({ name: "status", required: false, enum: NOTIFICATION_STATUSES })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiOkResponse({ description: "Avisos del usuario, paginados de 20 en 20, con el número de no leídos." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  list(@CurrentSession() session: AppSession, @QueryInput() query: NotificationListQueryDto, @PageContext() links: PageLinks) {
    return this.notifications.list(session, query, links)
  }

  @Post("read-all")
  @HttpCode(200)
  @Authenticated({ verified: true })
  @ApiOkResponse({ description: "Marca como leídos los avisos visibles.", type: MessageDto })
  markAllRead(@CurrentSession() session: AppSession) {
    return this.notifications.markAllRead(session)
  }

  @Post(":notification/read")
  @HttpCode(200)
  @Authenticated({ verified: true, preload: NotificationPreloader })
  @ApiParam({ name: "notification", format: "uuid" })
  @ApiOkResponse({ description: "Marca el aviso como leído.", type: MessageDto })
  @ApiNotFoundResponse({ description: "El aviso no existe.", type: MessageDto })
  markRead(@CurrentSession() session: AppSession, @Preloaded() notification: StoredNotification) {
    return this.notifications.markRead(session, notification)
  }

  @Post(":notification/open")
  @HttpCode(200)
  @Authenticated({ verified: true, activeRole: "optional", preload: NotificationPreloader })
  @ApiParam({ name: "notification", format: "uuid" })
  @ApiOkResponse({ description: "Marca el aviso como leído y devuelve la pantalla de destino; cambia el rol activo si hace falta." })
  @ApiNotFoundResponse({ description: "El aviso no existe.", type: MessageDto })
  open(@CurrentSession() session: AppSession, @Preloaded() notification: StoredNotification) {
    return this.notifications.open(session, notification)
  }

  @Get("email-preferences")
  @Authenticated({ verified: true })
  @ApiOkResponse({ description: "Avisos por correo disponibles para los roles del usuario." })
  emailPreferences(@CurrentSession() session: AppSession) {
    return this.notifications.emailPreferences(session)
  }

  @Put("email-preferences")
  @Authenticated({ verified: true, rateLimit: { name: "throttle:20,1", maxAttempts: 20, decaySeconds: 60 } })
  @UseInterceptors(EmailNoticeScopeInterceptor)
  @ApiOkResponse({ description: "Guarda los avisos por correo y devuelve las opciones." })
  @ApiUnprocessableEntityResponse(VALIDATION)
  @ApiTooManyRequestsResponse({ description: "Más de 20 cambios por minuto.", type: MessageDto })
  updateEmailPreferences(@CurrentSession() session: AppSession, @EmailNoticeRoles() roles: string[], @Body() input: EmailPreferencesDto) {
    return this.notifications.updateEmailPreferences(session, roles, input)
  }
}
