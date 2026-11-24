import { createCareerRecord } from "@/server/academic/careerWrites"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ entity: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  return createCareerRecord(request, (await context.params).entity)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
