import { unmatchedRouteHandler } from "@/server/http/router"
import { processImpact } from "@/server/syllabus/processes"

type Context = { params: Promise<{ process: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { process } = await context.params
  return processImpact(request, process)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
