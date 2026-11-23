import { proxyToLaravel } from "@/server/laravel/proxy"
import { libraryHistory } from "@/server/library/reviews"

export function GET(request: Request): Promise<Response> {
  return libraryHistory(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
