import { laravelRouterHandler } from "@/server/laravel/router"
import { teacherHistoryCareer } from "@/server/syllabus/teacherSyllabi"

type Context = { params: Promise<{ career: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { career } = await context.params
  return teacherHistoryCareer(request, career)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
