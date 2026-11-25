import { type CallHandler, type ExecutionContext, HttpStatus, Inject, Injectable, type NestInterceptor } from "@nestjs/common"
import { HTTP_CODE_METADATA } from "@nestjs/common/constants"
import { Reflector } from "@nestjs/core"
import { map, type Observable } from "rxjs"
import { apiJson } from "../../server/http/responses"
import type { SessionRequest } from "../http/session-request"
import { WebReply } from "../http/web-reply"
import { withRateLimitHeaders } from "./rate-limit"

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<WebReply> {
    const request = context.switchToHttp().getRequest<SessionRequest>()
    const status = this.reflector.get<number | undefined>(HTTP_CODE_METADATA, context.getHandler()) ?? HttpStatus.OK
    return next.handle().pipe(map((value: unknown) => (value instanceof WebReply ? value : new WebReply(withRateLimitHeaders(request, value instanceof Response ? value : apiJson(value, status))))))
  }
}
