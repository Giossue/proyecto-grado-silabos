import { updateAccessibility } from "@/server/identity/selfService"
import { unmatchedRouteHandler } from "@/server/http/router"

export function PUT(request: Request): Promise<Response> {
  return updateAccessibility(request)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
