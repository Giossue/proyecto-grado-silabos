import { destroyManagedUser, updateManagedUser } from "@/server/identity/accountWrites"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ user: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  return updateManagedUser(request, (await context.params).user)
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  return destroyManagedUser(request, (await context.params).user)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as OPTIONS }
