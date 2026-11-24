import { removeManagedUserRole } from "@/server/identity/accountWrites"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ user: string; assignment: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { user, assignment } = await context.params
  return removeManagedUserRole(request, user, assignment)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as GET,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as OPTIONS,
}
