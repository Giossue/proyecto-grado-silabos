import { userImportTemplate } from "@/server/identity/imports"
import { laravelRouterHandler } from "@/server/laravel/router"
import { destroyManagedUser, updateManagedUser } from "@/server/identity/accountWrites"

export function GET(request: Request): Promise<Response> {
  return userImportTemplate(request)
}

export function PATCH(request: Request): Promise<Response> {
  return updateManagedUser(request, "import-template")
}

export function DELETE(request: Request): Promise<Response> {
  return destroyManagedUser(request, "import-template")
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as OPTIONS }
