import { unmatchedRouteHandler } from "@/server/http/router"
import { compareRevisions } from "@/server/syllabus/coordinationReviews"

type Context = { params: Promise<{ revision: string; after: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { revision, after } = await context.params
  return compareRevisions(request, revision, after)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
