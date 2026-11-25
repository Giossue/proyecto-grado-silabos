import { importTeachers } from "@/server/identity/imports"
import { unmatchedRouteHandler } from "@/server/http/router"
import { destroyCareerTeacher } from "@/server/identity/careerTeachers"

export function POST(request: Request): Promise<Response> {
  return importTeachers(request)
}

export function DELETE(request: Request): Promise<Response> {
  return destroyCareerTeacher(request, "import")
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as OPTIONS }
