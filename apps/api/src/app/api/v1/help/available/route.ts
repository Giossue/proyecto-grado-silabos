import { unmatchedRouteHandler } from "@/server/http/router"
import { availableScreenHelp } from "@/server/operations/screenHelp"

export function GET(request: Request): Promise<Response> {
  return availableScreenHelp(request)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
