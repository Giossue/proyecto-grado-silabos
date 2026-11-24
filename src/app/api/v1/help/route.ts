import { laravelRouterHandler } from "@/server/laravel/router"
import { showScreenHelp } from "@/server/operations/screenHelp"

export function GET(request: Request): Promise<Response> {
  return showScreenHelp(request)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
