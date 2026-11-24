import { laravelRouterHandler } from "@/server/laravel/router"
import { regenerateRecoveryCodes } from "@/server/identity/twoFactor"

export function POST(request: Request): Promise<Response> {
  return regenerateRecoveryCodes(request)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
