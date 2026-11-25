import { withCookieQueue, withSetCookies } from "../../server/auth/cookieQueue"
import type { ApiRequest } from "../../common/http/web-request"
import { webRequestOf } from "../../common/http/web-request"

export async function queuedResponse(work: () => Promise<Response>): Promise<Response> {
  const { result, cookies } = await withCookieQueue(work)
  if (cookies.length === 0) return result
  try {
    return withSetCookies(result, cookies)
  } catch {
    return withSetCookies(new Response(result.body, result), cookies)
  }
}

export function respond(request: ApiRequest, work: (web: Request) => Promise<Response>): Promise<Response> {
  return queuedResponse(() => work(webRequestOf(request)))
}
