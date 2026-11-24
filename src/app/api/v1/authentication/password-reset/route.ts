import { laravelRouterHandler } from "@/server/laravel/router"
import { resetPassword } from "@/server/identity/passwordRecovery"

export function POST(request: Request): Promise<Response> {
  return resetPassword(request)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
