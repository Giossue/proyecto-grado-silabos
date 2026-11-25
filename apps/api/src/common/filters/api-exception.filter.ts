import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from "@nestjs/common"
import type { Response as ExpressResponse } from "express"
import { HttpFailure, reportedServerError } from "../../server/http/failures"
import { jsonError } from "../../server/http/responses"
import { unknownRoute } from "../../server/http/router"
import { ResponseException } from "../exceptions/response.exception"
import type { SessionRequest } from "../http/session-request"
import { webRequestOf } from "../http/web-request"
import { sendWebResponse } from "../http/web-response"
import { withRateLimitHeaders } from "../interceptors/rate-limit"

export function responseForException(exception: unknown, request: SessionRequest): Response {
  if (exception instanceof ResponseException || exception instanceof HttpFailure) return exception.response
  if (exception instanceof HttpException) {
    if (exception.getStatus() === 404) return unknownRoute(webRequestOf(request))
    const body = exception.getResponse()
    const message = typeof body === "string" ? body : typeof body === "object" && body !== null && "message" in body && typeof body.message === "string" ? body.message : exception.message
    return jsonError(exception.getStatus(), exception.getStatus() >= 500 ? "Server Error" : message)
  }
  return reportedServerError(exception)
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const http = host.switchToHttp()
    const request = http.getRequest<SessionRequest>()
    const response = http.getResponse<ExpressResponse>()
    if (response.headersSent) {
      response.end()
      return
    }
    await sendWebResponse(response, withRateLimitHeaders(request, responseForException(exception, request)))
  }
}
