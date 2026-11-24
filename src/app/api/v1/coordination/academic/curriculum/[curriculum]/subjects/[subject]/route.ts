import { deleteCurriculumSubject } from "@/server/academic/curriculumWrites"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ curriculum: string; subject: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { curriculum, subject } = await context.params
  return deleteCurriculumSubject(request, curriculum, subject)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as OPTIONS }
