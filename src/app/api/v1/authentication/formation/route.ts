import { updateFormation } from "@/server/identity/selfService"
import { unmatchedRouteHandler } from "@/server/http/router"

export function PUT(request: Request): Promise<Response> {
  return updateFormation(request)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
