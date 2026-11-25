import { unmatchedRouteHandler } from "@/server/http/router"
import { dashboardIndex } from "@/server/dashboard/dashboard"

export function GET(request: Request): Promise<Response> {
  return dashboardIndex(request)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
