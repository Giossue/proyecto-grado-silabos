import { createParallels } from "@/server/academic/careerWrites"
import { proxyToLaravel } from "@/server/laravel/proxy"

export async function POST(request: Request): Promise<Response> {
  return createParallels(request)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
