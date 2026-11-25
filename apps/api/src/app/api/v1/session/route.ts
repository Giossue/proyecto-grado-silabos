import { unmatchedRouteHandler } from "@/server/http/router"
import { showSession } from "@/server/identity/session"

export function GET(request: Request): Promise<Response> {
  return showSession(request)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
