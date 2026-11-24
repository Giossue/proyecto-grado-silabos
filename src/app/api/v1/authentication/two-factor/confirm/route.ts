import { proxyToLaravel } from "@/server/laravel/proxy"
import { confirmTwoFactor } from "@/server/identity/twoFactor"

export function POST(request: Request): Promise<Response> {
  return confirmTwoFactor(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as GET,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
