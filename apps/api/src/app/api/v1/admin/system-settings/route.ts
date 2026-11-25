import { unmatchedRouteHandler } from "@/server/http/router"
import { showSystemSettings } from "@/server/operations/systemSettings"

export function GET(request: Request): Promise<Response> {
  return showSystemSettings(request)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
