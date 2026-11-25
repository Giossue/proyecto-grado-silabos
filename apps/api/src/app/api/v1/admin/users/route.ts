import { storeManagedUser } from "@/server/identity/accountWrites"
import { managedUsers } from "@/server/identity/managedUsers"
import { unmatchedRouteHandler } from "@/server/http/router"

export function GET(request: Request): Promise<Response> {
  return managedUsers(request)
}

export function POST(request: Request): Promise<Response> {
  return storeManagedUser(request)
}

export { unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
