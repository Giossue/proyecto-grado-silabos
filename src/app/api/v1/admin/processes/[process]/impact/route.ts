import { laravelRouterHandler } from "@/server/laravel/router"
import { processImpact } from "@/server/syllabus/processes"

type Context = { params: Promise<{ process: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { process } = await context.params
  return processImpact(request, process)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
