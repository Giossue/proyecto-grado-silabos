import { destroyManagedUser, updateManagedUser } from "@/server/identity/accountWrites"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ user: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  return updateManagedUser(request, (await context.params).user)
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  return destroyManagedUser(request, (await context.params).user)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as OPTIONS }
