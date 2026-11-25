import { unmatchedRouteHandler } from "@/server/http/router"
import { teacherSyllabi } from "@/server/syllabus/teacherSyllabi"

export function GET(request: Request): Promise<Response> {
  return teacherSyllabi(request)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
