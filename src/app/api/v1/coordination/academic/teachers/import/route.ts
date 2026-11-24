import { importTeachers } from "@/server/identity/imports"
import { proxyToLaravel } from "@/server/laravel/proxy"

export function POST(request: Request): Promise<Response> {
  return importTeachers(request)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
