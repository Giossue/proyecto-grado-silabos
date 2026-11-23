import { proxyToLaravel } from "@/server/laravel/proxy"
import { showEmailPreferences } from "@/server/operations/emailPreferences"

export function GET(request: Request): Promise<Response> {
  return showEmailPreferences(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
