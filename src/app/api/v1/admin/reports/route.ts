import { proxyToLaravel } from "@/server/laravel/proxy"
import { processReport } from "@/server/syllabus/processReport"

export function GET(request: Request): Promise<Response> {
  return processReport(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
