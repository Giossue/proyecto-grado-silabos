import { WebReply } from "../../common/http/web-reply"
import { type ApiRequest, webRequestOf } from "../../common/http/web-request"
import { withCookieQueue, withSetCookies } from "../../server/auth/cookieQueue"

export async function identityReply(request: ApiRequest, handler: (web: Request) => Promise<Response>): Promise<WebReply> {
  const { result, cookies } = await withCookieQueue(() => handler(webRequestOf(request)))
  if (cookies.length === 0) return new WebReply(result)
  try {
    return new WebReply(withSetCookies(result, cookies))
  } catch {
    return new WebReply(withSetCookies(new Response(result.body, result), cookies))
  }
}
