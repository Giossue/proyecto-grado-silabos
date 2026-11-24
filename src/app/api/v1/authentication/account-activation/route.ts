import { laravelRouterHandler } from "@/server/laravel/router"
import { activateAccount } from "@/server/identity/passwordRecovery"

export function POST(request: Request): Promise<Response> {
  return activateAccount(request)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
