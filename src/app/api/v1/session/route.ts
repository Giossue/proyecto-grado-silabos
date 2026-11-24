import { laravelRouterHandler } from "@/server/laravel/router"
import { showSession } from "@/server/identity/session"

export function GET(request: Request): Promise<Response> {
  return showSession(request)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
