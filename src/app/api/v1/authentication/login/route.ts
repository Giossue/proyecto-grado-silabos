import { login } from "@/server/identity/authentication"
import { proxyToLaravel } from "@/server/laravel/proxy"

export function POST(request: Request): Promise<Response> {
  return login(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as GET,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
