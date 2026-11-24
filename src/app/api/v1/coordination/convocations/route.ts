import { proxyToLaravel } from "@/server/laravel/proxy"
import { convocations } from "@/server/syllabus/convocations"

export function GET(request: Request): Promise<Response> {
  return convocations(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
