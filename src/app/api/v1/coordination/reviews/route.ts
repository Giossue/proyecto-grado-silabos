import { proxyToLaravel } from "@/server/laravel/proxy"
import { coordinationReviews } from "@/server/syllabus/coordinationReviews"

export function GET(request: Request): Promise<Response> {
  return coordinationReviews(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
