import { updateSubjectLayout } from "@/server/academic/curriculumWrites"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ curriculum: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  return updateSubjectLayout(request, (await context.params).curriculum)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
