import { unmatchedRouteHandler } from "@/server/http/router"
import { confirmTwoFactor } from "@/server/identity/twoFactor"

export function POST(request: Request): Promise<Response> {
  return confirmTwoFactor(request)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
