import { destroySession } from "@/server/identity/selfService"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ session: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  return destroySession(request, (await context.params).session)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as GET,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as OPTIONS,
}
