import { unmatchedRouteHandler } from "@/server/http/router"
import { requestCorrection } from "@/server/syllabus/reviewDecisions"

type Context = { params: Promise<{ revision: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { revision } = await context.params
  return requestCorrection(request, revision)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
