import { unmatchedRouteHandler } from "@/server/http/router"
import { markAllNotificationsRead } from "@/server/operations/notifications"

export function POST(request: Request): Promise<Response> {
  return markAllNotificationsRead(request)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
