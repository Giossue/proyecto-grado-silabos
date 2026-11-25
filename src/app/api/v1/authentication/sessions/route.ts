import { activeSessions } from "@/server/identity/sessions"
import { unmatchedRouteHandler } from "@/server/http/router"

export function GET(request: Request): Promise<Response> {
  return activeSessions(request)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
