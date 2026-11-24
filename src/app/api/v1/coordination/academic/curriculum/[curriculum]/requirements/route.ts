import { createSubjectRequirement } from "@/server/academic/curriculumWrites"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ curriculum: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  return createSubjectRequirement(request, (await context.params).curriculum)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
