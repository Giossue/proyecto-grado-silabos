import { importTeachers } from "@/server/identity/imports"
import { laravelRouterHandler } from "@/server/laravel/router"
import { destroyCareerTeacher } from "@/server/identity/careerTeachers"

export function POST(request: Request): Promise<Response> {
  return importTeachers(request)
}

export function DELETE(request: Request): Promise<Response> {
  return destroyCareerTeacher(request, "import")
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as OPTIONS }
