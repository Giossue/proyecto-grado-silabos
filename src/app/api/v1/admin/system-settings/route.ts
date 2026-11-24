import { laravelRouterHandler } from "@/server/laravel/router"
import { showSystemSettings } from "@/server/operations/systemSettings"

export function GET(request: Request): Promise<Response> {
  return showSystemSettings(request)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
