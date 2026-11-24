import { updateAccessibility } from "@/server/identity/selfService"
import { laravelRouterHandler } from "@/server/laravel/router"

export function PUT(request: Request): Promise<Response> {
  return updateAccessibility(request)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as POST, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
