import { unmatchedRouteHandler } from "@/server/http/router"
import { coordinationReviewDetail } from "@/server/syllabus/reviewDetails"

type Context = { params: Promise<{ revision: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { revision } = await context.params
  return coordinationReviewDetail(request, revision)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
