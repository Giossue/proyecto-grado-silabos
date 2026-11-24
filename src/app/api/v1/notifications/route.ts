import { laravelRouterHandler } from "@/server/laravel/router"
import { listNotifications } from "@/server/operations/notifications"

export function GET(request: Request): Promise<Response> {
  return listNotifications(request)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
