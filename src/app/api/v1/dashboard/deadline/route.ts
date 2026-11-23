import { proxyToLaravel } from "@/server/laravel/proxy"
import { dashboardDeadline } from "@/server/dashboard/dashboard"

export function GET(request: Request): Promise<Response> {
  return dashboardDeadline(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
