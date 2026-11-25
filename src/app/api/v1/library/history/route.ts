import { unmatchedRouteHandler } from "@/server/http/router"
import { libraryHistory } from "@/server/library/reviews"

export function GET(request: Request): Promise<Response> {
  return libraryHistory(request)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
