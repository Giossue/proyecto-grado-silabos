import type { SessionRequest } from "../http/session-request"

export function withRateLimitHeaders(request: SessionRequest, response: Response): Response {
  return request.rateLimit ? request.rateLimit.decorate(response) : response
}
