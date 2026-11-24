import { resendOwnActivation } from "@/server/identity/selfService"
import { laravelRouterHandler } from "@/server/laravel/router"

export function POST(request: Request): Promise<Response> {
  return resendOwnActivation(request)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
