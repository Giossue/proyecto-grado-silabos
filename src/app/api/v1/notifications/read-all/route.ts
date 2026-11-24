import { laravelRouterHandler } from "@/server/laravel/router"
import { markAllNotificationsRead } from "@/server/operations/notifications"

export function POST(request: Request): Promise<Response> {
  return markAllNotificationsRead(request)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
