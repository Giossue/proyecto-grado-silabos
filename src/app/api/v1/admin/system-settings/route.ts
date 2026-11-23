import { proxyToLaravel } from "@/server/laravel/proxy"
import { showSystemSettings } from "@/server/operations/systemSettings"

export function GET(request: Request): Promise<Response> {
  return showSystemSettings(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
