import { teacherAssignments } from "@/server/academic/structure"
import { unmatchedRouteHandler } from "@/server/http/router"

export function GET(request: Request): Promise<Response> {
  return teacherAssignments(request)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
