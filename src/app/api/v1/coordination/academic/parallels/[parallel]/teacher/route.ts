import { replaceParallelTeacher } from "@/server/academic/careerWrites"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ parallel: string }> }

export async function PUT(request: Request, context: Context): Promise<Response> {
  return replaceParallelTeacher(request, (await context.params).parallel)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
