import { careerImportTemplate } from "@/server/academic/structureImports"
import { proxyToLaravel } from "@/server/laravel/proxy"

export function GET(request: Request): Promise<Response> {
  return careerImportTemplate(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
