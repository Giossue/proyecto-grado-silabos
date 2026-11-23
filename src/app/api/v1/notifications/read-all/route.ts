import { proxyToLaravel } from "@/server/laravel/proxy"
import { markAllNotificationsRead } from "@/server/operations/notifications"

export function POST(request: Request): Promise<Response> {
  return markAllNotificationsRead(request)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
