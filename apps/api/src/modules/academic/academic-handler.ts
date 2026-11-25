import { All, applyDecorators, HttpCode } from "@nestjs/common"
import { ApiCookieAuth, ApiExcludeEndpoint, ApiForbiddenResponse, ApiUnauthorizedResponse } from "@nestjs/swagger"
import { SESSION_COOKIE } from "../../common/decorators/authenticated.decorator"
import { type ApiRequest, webRequestOf } from "../../common/http/web-request"
import { WebReply } from "../../common/http/web-reply"
import { withCookieQueue, withSetCookies } from "../../server/auth/cookieQueue"
import { unmatchedRoute } from "../../server/http/router"

export const TRANSACTION_OPTIONS = { maxWait: 60_000, timeout: 600_000 } as const

export function SessionInHandler() {
  return applyDecorators(
    ApiCookieAuth(SESSION_COOKIE),
    ApiUnauthorizedResponse({ description: "Sin sesión: { \"message\": \"Unauthenticated.\" }" }),
    ApiForbiddenResponse({ description: "Sin permiso, cuenta no verificada o carrera inactiva." }),
  )
}

export function UnmatchedMethods(path: string) {
  return applyDecorators(All(path), HttpCode(200), ApiExcludeEndpoint())
}

export async function handled(request: ApiRequest, handler: (web: Request) => Promise<Response> | Response): Promise<WebReply> {
  const { result, cookies } = await withCookieQueue(async () => handler(webRequestOf(request)))
  if (cookies.length === 0) return new WebReply(result)
  try {
    return new WebReply(withSetCookies(result, cookies))
  } catch {
    return new WebReply(withSetCookies(new Response(result.body, result), cookies))
  }
}

export function unmatched(request: ApiRequest): Promise<WebReply> {
  return handled(request, unmatchedRoute)
}
