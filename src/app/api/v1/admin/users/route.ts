import { storeManagedUser } from "@/server/identity/accountWrites"
import { managedUsers } from "@/server/identity/managedUsers"
import { proxyToLaravel } from "@/server/laravel/proxy"

export function GET(request: Request): Promise<Response> {
  return managedUsers(request)
}

export function POST(request: Request): Promise<Response> {
  return storeManagedUser(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
