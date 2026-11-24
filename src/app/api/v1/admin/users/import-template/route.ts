import { userImportTemplate } from "@/server/identity/imports"
import { proxyToLaravel } from "@/server/laravel/proxy"

export function GET(request: Request): Promise<Response> {
  return userImportTemplate(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
