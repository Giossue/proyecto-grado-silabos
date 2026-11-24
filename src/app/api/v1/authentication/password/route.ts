import { updatePassword } from "@/server/identity/authentication"
import { laravelRouterHandler } from "@/server/laravel/router"

export function PUT(request: Request): Promise<Response> {
  return updatePassword(request)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as POST, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
