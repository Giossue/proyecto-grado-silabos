import { unmatchedRouteHandler } from "@/server/http/router"
import { listNotifications } from "@/server/operations/notifications"

export function GET(request: Request): Promise<Response> {
  return listNotifications(request)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
