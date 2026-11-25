import { unmatchedRouteHandler } from "@/server/http/router"
import { validateDraft } from "@/server/syllabus/draftValidation"

type Context = { params: Promise<{ syllabus: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { syllabus } = await context.params
  return validateDraft(request, syllabus)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
