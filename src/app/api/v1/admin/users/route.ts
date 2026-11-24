import { storeManagedUser } from "@/server/identity/accountWrites"
import { managedUsers } from "@/server/identity/managedUsers"
import { laravelRouterHandler } from "@/server/laravel/router"

export function GET(request: Request): Promise<Response> {
  return managedUsers(request)
}

export function POST(request: Request): Promise<Response> {
  return storeManagedUser(request)
}

export { laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
