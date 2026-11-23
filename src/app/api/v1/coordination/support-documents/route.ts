import { coordinationSupportDocuments } from "@/server/academic/supportDocuments"
import { proxyToLaravel } from "@/server/laravel/proxy"

export function GET(request: Request): Promise<Response> {
  return coordinationSupportDocuments(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
