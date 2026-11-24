import { destroyOtherSessions } from "@/server/identity/selfService"
import { laravelRouterHandler } from "@/server/laravel/router"

export function DELETE(request: Request): Promise<Response> {
  return destroyOtherSessions(request)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as OPTIONS }
