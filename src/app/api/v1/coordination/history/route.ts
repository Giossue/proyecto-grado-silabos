import { unmatchedRouteHandler } from "@/server/http/router"
import { coordinationHistory } from "@/server/syllabus/coordinationReviews"

export function GET(request: Request): Promise<Response> {
  return coordinationHistory(request)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
