import { destroyOtherSessions } from "@/server/identity/selfService"
import { proxyToLaravel } from "@/server/laravel/proxy"

export function DELETE(request: Request): Promise<Response> {
  return destroyOtherSessions(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as GET,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as OPTIONS,
}
