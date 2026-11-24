import { laravelRouterHandler } from "@/server/laravel/router"
import { submitSyllabus } from "@/server/syllabus/submission"

type Context = { params: Promise<{ syllabus: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { syllabus } = await context.params
  return submitSyllabus(request, syllabus)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
