import { proxyToLaravel } from "@/server/laravel/proxy"
import { twoFactorStatus } from "@/server/identity/session"

export function GET(request: Request): Promise<Response> {
  return twoFactorStatus(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
