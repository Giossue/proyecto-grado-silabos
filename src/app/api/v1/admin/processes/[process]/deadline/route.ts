import { laravelRouterHandler } from "@/server/laravel/router"
import { extendProcessDeadline } from "@/server/syllabus/processWrites"

type Context = { params: Promise<{ process: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { process } = await context.params
  return extendProcessDeadline(request, process)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
