import { unmatchedRouteHandler } from "@/server/http/router"
import { copySyllabusContent } from "@/server/syllabus/draftStart"

type Context = { params: Promise<{ syllabus: string; source: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { syllabus, source } = await context.params
  return copySyllabusContent(request, syllabus, source)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
