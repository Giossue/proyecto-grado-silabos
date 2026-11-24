import { laravelRouter, laravelRouterHandler } from "@/server/laravel/router"
import { resumeConvocation } from "@/server/syllabus/convocationWrites"
import { pauseConvocation } from "@/server/syllabus/convocations"

type Context = { params: Promise<{ convocation: string; transition: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { convocation, transition } = await context.params
  if (transition === "pausar") return pauseConvocation(request, convocation)
  if (transition === "reanudar") return resumeConvocation(request, convocation)
  return laravelRouter(request)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
