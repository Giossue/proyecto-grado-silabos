import { unmatchedRouteHandler } from "@/server/http/router"
import { teacherHistory } from "@/server/syllabus/teacherSyllabi"

export function GET(request: Request): Promise<Response> {
  return teacherHistory(request)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
