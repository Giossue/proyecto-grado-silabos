import { destroyOtherSessions } from "@/server/identity/selfService"
import { unmatchedRouteHandler } from "@/server/http/router"

export function DELETE(request: Request): Promise<Response> {
  return destroyOtherSessions(request)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as OPTIONS }
