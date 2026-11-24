import { proxyToLaravel } from "@/server/laravel/proxy"
import { createConvocation } from "@/server/syllabus/convocationWrites"
import { convocations } from "@/server/syllabus/convocations"

export function GET(request: Request): Promise<Response> {
  return convocations(request)
}

export function POST(request: Request): Promise<Response> {
  return createConvocation(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
