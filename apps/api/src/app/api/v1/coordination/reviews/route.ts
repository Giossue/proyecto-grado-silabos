import { unmatchedRouteHandler } from "@/server/http/router"
import { coordinationReviews } from "@/server/syllabus/coordinationReviews"

export function GET(request: Request): Promise<Response> {
  return coordinationReviews(request)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
