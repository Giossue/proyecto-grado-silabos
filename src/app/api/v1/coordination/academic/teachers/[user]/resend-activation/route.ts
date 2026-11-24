import { resendCareerTeacherActivation } from "@/server/identity/careerTeachers"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ user: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  return resendCareerTeacherActivation(request, (await context.params).user)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
