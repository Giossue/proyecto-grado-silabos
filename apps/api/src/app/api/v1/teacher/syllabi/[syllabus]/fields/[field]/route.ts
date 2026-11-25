import { unmatchedRouteHandler } from "@/server/http/router"
import { updateDraftField } from "@/server/syllabus/draftField"

type Context = { params: Promise<{ syllabus: string; field: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { syllabus, field } = await context.params
  return updateDraftField(request, syllabus, field)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
