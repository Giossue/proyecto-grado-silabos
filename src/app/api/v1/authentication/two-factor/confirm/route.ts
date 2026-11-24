import { laravelRouterHandler } from "@/server/laravel/router"
import { confirmTwoFactor } from "@/server/identity/twoFactor"

export function POST(request: Request): Promise<Response> {
  return confirmTwoFactor(request)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
