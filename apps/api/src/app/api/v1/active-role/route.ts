import { leaveActiveRole, selectActiveRole } from "@/server/identity/authentication"
import { unmatchedRouteHandler } from "@/server/http/router"

export function PUT(request: Request): Promise<Response> {
  return selectActiveRole(request)
}

export function DELETE(request: Request): Promise<Response> {
  return leaveActiveRole(request)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as OPTIONS }
