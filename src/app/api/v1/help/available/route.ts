import { proxyToLaravel } from "@/server/laravel/proxy"
import { availableScreenHelp } from "@/server/operations/screenHelp"

export function GET(request: Request): Promise<Response> {
  return availableScreenHelp(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
