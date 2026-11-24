import { removeManagedUserRole } from "@/server/identity/accountWrites"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ user: string; assignment: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { user, assignment } = await context.params
  return removeManagedUserRole(request, user, assignment)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as OPTIONS }
