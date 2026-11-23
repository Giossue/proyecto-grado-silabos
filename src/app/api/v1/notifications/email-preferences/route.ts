import { proxyToLaravel } from "@/server/laravel/proxy"
import { showEmailPreferences, updateEmailPreferences } from "@/server/operations/emailPreferences"

export function GET(request: Request): Promise<Response> {
  return showEmailPreferences(request)
}

export function PUT(request: Request): Promise<Response> {
  return updateEmailPreferences(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
