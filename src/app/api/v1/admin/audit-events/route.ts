import { proxyToLaravel } from "@/server/laravel/proxy"
import { listAuditEvents } from "@/server/operations/auditEvents"

export function GET(request: Request): Promise<Response> {
  return listAuditEvents(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
