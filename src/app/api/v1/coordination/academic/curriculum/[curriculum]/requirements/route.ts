import { createSubjectRequirement } from "@/server/academic/curriculumWrites"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ curriculum: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  return createSubjectRequirement(request, (await context.params).curriculum)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
