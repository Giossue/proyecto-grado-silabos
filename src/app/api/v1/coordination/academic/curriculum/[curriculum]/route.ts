import { curriculumBuilder } from "@/server/academic/structure"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ curriculum: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { curriculum } = await context.params
  return curriculumBuilder(request, curriculum)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
