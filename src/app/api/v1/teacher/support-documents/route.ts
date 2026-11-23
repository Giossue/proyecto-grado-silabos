import { teacherSupportDocuments } from "@/server/academic/supportDocuments"
import { proxyToLaravel } from "@/server/laravel/proxy"

export function GET(request: Request): Promise<Response> {
  return teacherSupportDocuments(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
