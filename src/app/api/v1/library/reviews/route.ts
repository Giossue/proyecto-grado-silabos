import { proxyToLaravel } from "@/server/laravel/proxy"
import { libraryReviews } from "@/server/library/reviews"

export function GET(request: Request): Promise<Response> {
  return libraryReviews(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
