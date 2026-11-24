import { leaveActiveRole, selectActiveRole } from "@/server/identity/authentication"
import { laravelRouterHandler } from "@/server/laravel/router"

export function PUT(request: Request): Promise<Response> {
  return selectActiveRole(request)
}

export function DELETE(request: Request): Promise<Response> {
  return leaveActiveRole(request)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as POST, laravelRouterHandler as PATCH, laravelRouterHandler as OPTIONS }
