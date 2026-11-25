import { csrfCookie } from "@/server/identity/authentication"
import { unmatchedRouteHandler } from "@/server/http/router"

export function GET(request: Request): Promise<Response> {
  return csrfCookie(request)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
