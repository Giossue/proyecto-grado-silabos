import { deleteSubjectRequirement } from "@/server/academic/curriculumWrites"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ curriculum: string; requirement: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { curriculum, requirement } = await context.params
  return deleteSubjectRequirement(request, curriculum, requirement)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as OPTIONS }
