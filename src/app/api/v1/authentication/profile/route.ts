import { updateProfile } from "@/server/identity/selfService"
import { proxyToLaravel } from "@/server/laravel/proxy"

export function PUT(request: Request): Promise<Response> {
  return updateProfile(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as GET,
  proxyToLaravel as POST,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
