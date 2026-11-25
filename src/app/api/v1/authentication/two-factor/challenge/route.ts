import { unmatchedRouteHandler } from "@/server/http/router"
import { twoFactorChallenge } from "@/server/identity/twoFactor"

export function POST(request: Request): Promise<Response> {
  return twoFactorChallenge(request)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
