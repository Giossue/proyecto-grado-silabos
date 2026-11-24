import { importCurriculum } from "@/server/academic/structureImports"
import { proxyToLaravel } from "@/server/laravel/proxy"

export function POST(request: Request): Promise<Response> {
  return importCurriculum(request)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
