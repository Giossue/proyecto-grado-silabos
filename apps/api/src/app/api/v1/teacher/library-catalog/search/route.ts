import { unmatchedRouteHandler } from "@/server/http/router"
import { searchCatalog } from "@/server/library/catalogHandlers"

export function GET(request: Request): Promise<Response> {
  return searchCatalog(request)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
