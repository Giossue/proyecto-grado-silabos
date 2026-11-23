import { proxyToLaravel } from "@/server/laravel/proxy"
import { listNotifications } from "@/server/operations/notifications"

export function GET(request: Request): Promise<Response> {
  return listNotifications(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
