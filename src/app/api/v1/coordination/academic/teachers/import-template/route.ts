import { teacherImportTemplate } from "@/server/identity/imports"
import { laravelRouterHandler } from "@/server/laravel/router"
import { destroyCareerTeacher } from "@/server/identity/careerTeachers"

export function GET(request: Request): Promise<Response> {
  return teacherImportTemplate(request)
}

export function DELETE(request: Request): Promise<Response> {
  return destroyCareerTeacher(request, "import-template")
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as OPTIONS }
