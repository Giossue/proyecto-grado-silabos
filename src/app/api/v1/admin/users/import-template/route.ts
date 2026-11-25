import { userImportTemplate } from "@/server/identity/imports"
import { unmatchedRouteHandler } from "@/server/http/router"
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

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as OPTIONS }
