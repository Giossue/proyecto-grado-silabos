import { laravelRouterHandler } from "@/server/laravel/router"
import { dashboardIndex } from "@/server/dashboard/dashboard"

export function GET(request: Request): Promise<Response> {
  return dashboardIndex(request)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
