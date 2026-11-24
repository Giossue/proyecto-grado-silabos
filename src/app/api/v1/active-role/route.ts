import { leaveActiveRole, selectActiveRole } from "@/server/identity/authentication"
import { proxyToLaravel } from "@/server/laravel/proxy"

export function PUT(request: Request): Promise<Response> {
  return selectActiveRole(request)
}

export function DELETE(request: Request): Promise<Response> {
  return leaveActiveRole(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as GET,
  proxyToLaravel as POST,
  proxyToLaravel as PATCH,
  proxyToLaravel as OPTIONS,
}
