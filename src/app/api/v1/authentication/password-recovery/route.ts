import { sendResetLink } from "@/server/identity/passwordRecovery"
import { laravelRouterHandler } from "@/server/laravel/router"

export function POST(request: Request): Promise<Response> {
  return sendResetLink(request)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
