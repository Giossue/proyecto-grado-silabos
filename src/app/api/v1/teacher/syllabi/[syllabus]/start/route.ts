import { unmatchedRouteHandler } from "@/server/http/router"
import { startDraft } from "@/server/syllabus/draftStart"

type Context = { params: Promise<{ syllabus: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { syllabus } = await context.params
  return startDraft(request, syllabus)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
