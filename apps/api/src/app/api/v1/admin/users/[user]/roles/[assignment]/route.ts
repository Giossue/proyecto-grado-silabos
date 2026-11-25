import { removeManagedUserRole } from "@/server/identity/accountWrites"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ user: string; assignment: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { user, assignment } = await context.params
  return removeManagedUserRole(request, user, assignment)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as OPTIONS }
