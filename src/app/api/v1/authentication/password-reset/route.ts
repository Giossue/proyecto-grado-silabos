import { proxyToLaravel } from "@/server/laravel/proxy"
import { resetPassword } from "@/server/identity/passwordRecovery"

export function POST(request: Request): Promise<Response> {
  return resetPassword(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as GET,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
