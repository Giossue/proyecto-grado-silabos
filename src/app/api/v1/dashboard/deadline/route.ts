import { unmatchedRouteHandler } from "@/server/http/router"
import { dashboardDeadline } from "@/server/dashboard/dashboard"

export function GET(request: Request): Promise<Response> {
  return dashboardDeadline(request)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
