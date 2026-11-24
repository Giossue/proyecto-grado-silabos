import { importUsers } from "@/server/identity/imports"
import { laravelRouterHandler } from "@/server/laravel/router"
import { destroyManagedUser, updateManagedUser } from "@/server/identity/accountWrites"

export function POST(request: Request): Promise<Response> {
  return importUsers(request)
}

export function PATCH(request: Request): Promise<Response> {
  return updateManagedUser(request, "import")
}

export function DELETE(request: Request): Promise<Response> {
  return destroyManagedUser(request, "import")
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as OPTIONS }
