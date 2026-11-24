import { importCareers } from "@/server/academic/structureImports"
import { proxyToLaravel } from "@/server/laravel/proxy"

export function POST(request: Request): Promise<Response> {
  return importCareers(request)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
