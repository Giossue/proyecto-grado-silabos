import { importUsers } from "@/server/identity/imports"
import { unmatchedRouteHandler } from "@/server/http/router"
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

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as OPTIONS }
