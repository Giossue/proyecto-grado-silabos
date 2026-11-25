import { unmatchedRouteHandler } from "@/server/http/router"
import { catalogLibraries } from "@/server/library/catalogHandlers"

export function GET(request: Request): Promise<Response> {
  return catalogLibraries(request)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
