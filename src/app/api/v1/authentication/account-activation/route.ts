import { proxyToLaravel } from "@/server/laravel/proxy"
import { activateAccount } from "@/server/identity/passwordRecovery"

export function POST(request: Request): Promise<Response> {
  return activateAccount(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as GET,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
