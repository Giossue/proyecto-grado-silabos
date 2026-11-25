import { updatePassword } from "@/server/identity/authentication"
import { unmatchedRouteHandler } from "@/server/http/router"

export function PUT(request: Request): Promise<Response> {
  return updatePassword(request)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
