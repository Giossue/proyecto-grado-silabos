import { type CallHandler, type ExecutionContext, Inject, Injectable, type NestInterceptor } from "@nestjs/common"
import { from, Observable, switchMap } from "rxjs"
import { runWithValidationContext } from "../../common/context/validation-context"
import type { SessionRequest } from "../../common/http/session-request"
import { emailOptionsFor } from "../../server/operations/emailNoticeCatalog"
import { NotificationsService } from "./notifications.service"

export const EMAIL_NOTICE_TYPES = "emailNoticeTypes"

export type EmailNoticeRequest = SessionRequest & { emailNoticeRoles?: string[] }

@Injectable()
export class EmailNoticeScopeInterceptor implements NestInterceptor {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<EmailNoticeRequest>()
    const userId = request.appSession?.user.id ?? ""
    return from(this.notifications.roles(userId)).pipe(
      switchMap((roles) => {
        request.emailNoticeRoles = roles
        const types = emailOptionsFor(roles, null).map((option) => option.type)
        return new Observable<unknown>((subscriber) => runWithValidationContext({ [EMAIL_NOTICE_TYPES]: types }, () => next.handle().subscribe(subscriber)))
      }),
    )
  }
}
