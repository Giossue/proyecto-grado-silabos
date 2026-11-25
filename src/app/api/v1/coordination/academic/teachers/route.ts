import { storeCareerTeacher } from "@/server/identity/careerTeachers"
import { unmatchedRouteHandler } from "@/server/http/router"

export function POST(request: Request): Promise<Response> {
  return storeCareerTeacher(request)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
