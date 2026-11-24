import { templateIndex } from "@/server/configuration/templateBuilder"
import { proxyToLaravel } from "@/server/laravel/proxy"

export async function GET(request: Request): Promise<Response> {
  return templateIndex(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
