import { destroyManagedUser, updateManagedUser } from "@/server/identity/accountWrites"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ user: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  return updateManagedUser(request, (await context.params).user)
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  return destroyManagedUser(request, (await context.params).user)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as GET,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as OPTIONS,
}
