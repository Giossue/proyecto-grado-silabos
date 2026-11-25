import { unmatchedRoute, unmatchedRouteHandler } from "@/server/http/router"
import { resumeConvocation } from "@/server/syllabus/convocationWrites"
import { pauseConvocation } from "@/server/syllabus/convocations"

type Context = { params: Promise<{ convocation: string; transition: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { convocation, transition } = await context.params
  if (transition === "pausar") return pauseConvocation(request, convocation)
  if (transition === "reanudar") return resumeConvocation(request, convocation)
  return unmatchedRoute(request)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
