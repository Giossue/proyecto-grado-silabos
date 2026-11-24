import { replaceParallelTeacher } from "@/server/academic/careerWrites"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ parallel: string }> }

export async function PUT(request: Request, context: Context): Promise<Response> {
  return replaceParallelTeacher(request, (await context.params).parallel)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as POST, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
