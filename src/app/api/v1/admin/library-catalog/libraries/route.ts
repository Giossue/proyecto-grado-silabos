import { proxyToLaravel } from "@/server/laravel/proxy"
import { catalogLibraries } from "@/server/library/catalogHandlers"

export function GET(request: Request): Promise<Response> {
  return catalogLibraries(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
