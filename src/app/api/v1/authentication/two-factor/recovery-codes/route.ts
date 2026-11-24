import { proxyToLaravel } from "@/server/laravel/proxy"
import { regenerateRecoveryCodes } from "@/server/identity/twoFactor"

export function POST(request: Request): Promise<Response> {
  return regenerateRecoveryCodes(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as GET,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
