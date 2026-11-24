import { laravelRouterHandler } from "@/server/laravel/router"
import { copySyllabusContent } from "@/server/syllabus/draftStart"

type Context = { params: Promise<{ syllabus: string; source: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { syllabus, source } = await context.params
  return copySyllabusContent(request, syllabus, source)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
