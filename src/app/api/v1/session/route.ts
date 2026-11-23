import { proxyToLaravel } from "@/server/laravel/proxy"
import { showSession } from "@/server/identity/session"

export function GET(request: Request): Promise<Response> {
  return showSession(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
