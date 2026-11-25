import { unmatchedRouteHandler } from "@/server/http/router"
import { resetPassword } from "@/server/identity/passwordRecovery"

export function POST(request: Request): Promise<Response> {
  return resetPassword(request)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
