import { teacherImportTemplate } from "@/server/identity/imports"
import { unmatchedRouteHandler } from "@/server/http/router"
import { destroyCareerTeacher } from "@/server/identity/careerTeachers"

export function GET(request: Request): Promise<Response> {
  return teacherImportTemplate(request)
}

export function DELETE(request: Request): Promise<Response> {
  return destroyCareerTeacher(request, "import-template")
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as OPTIONS }
