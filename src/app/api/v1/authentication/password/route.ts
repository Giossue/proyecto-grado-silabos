import { updatePassword } from "@/server/identity/authentication"
import { proxyToLaravel } from "@/server/laravel/proxy"

export function PUT(request: Request): Promise<Response> {
  return updatePassword(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as GET,
  proxyToLaravel as POST,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
