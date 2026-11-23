import { proxyToLaravel } from "@/server/laravel/proxy"
import { showScreenHelp } from "@/server/operations/screenHelp"

export function GET(request: Request): Promise<Response> {
  return showScreenHelp(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
