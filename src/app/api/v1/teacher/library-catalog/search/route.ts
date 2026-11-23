import { proxyToLaravel } from "@/server/laravel/proxy"
import { searchCatalog } from "@/server/library/catalogHandlers"

export function GET(request: Request): Promise<Response> {
  return searchCatalog(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
