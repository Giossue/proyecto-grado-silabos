import { teacherAssignments } from "@/server/academic/structure"
import { proxyToLaravel } from "@/server/laravel/proxy"

export function GET(request: Request): Promise<Response> {
  return teacherAssignments(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
