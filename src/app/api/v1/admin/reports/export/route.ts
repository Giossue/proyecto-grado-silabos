import { proxyToLaravel } from "@/server/laravel/proxy"
import { exportProcessReport } from "@/server/syllabus/processReport"

export function GET(request: Request): Promise<Response> {
  return exportProcessReport(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
