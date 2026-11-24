import { laravelRouterHandler } from "@/server/laravel/router"
import { availableScreenHelp } from "@/server/operations/screenHelp"

export function GET(request: Request): Promise<Response> {
  return availableScreenHelp(request)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
