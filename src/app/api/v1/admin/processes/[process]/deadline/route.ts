import { unmatchedRouteHandler } from "@/server/http/router"
import { extendProcessDeadline } from "@/server/syllabus/processWrites"

type Context = { params: Promise<{ process: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { process } = await context.params
  return extendProcessDeadline(request, process)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
