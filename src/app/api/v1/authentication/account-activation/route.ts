import { unmatchedRouteHandler } from "@/server/http/router"
import { activateAccount } from "@/server/identity/passwordRecovery"

export function POST(request: Request): Promise<Response> {
  return activateAccount(request)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
