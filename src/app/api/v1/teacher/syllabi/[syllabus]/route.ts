import { laravelRouterHandler } from "@/server/laravel/router"
import { teacherSyllabusDetail } from "@/server/syllabus/syllabusDetail"

type Context = { params: Promise<{ syllabus: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { syllabus } = await context.params
  return teacherSyllabusDetail(request, syllabus)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
