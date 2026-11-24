import { destroyCareerTeacher } from "@/server/identity/careerTeachers"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ user: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  return destroyCareerTeacher(request, (await context.params).user)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as OPTIONS }
