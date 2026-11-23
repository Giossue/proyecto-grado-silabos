import { proxyToLaravel } from "@/server/laravel/proxy"
import { dashboardIndex } from "@/server/dashboard/dashboard"

export function GET(request: Request): Promise<Response> {
  return dashboardIndex(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
