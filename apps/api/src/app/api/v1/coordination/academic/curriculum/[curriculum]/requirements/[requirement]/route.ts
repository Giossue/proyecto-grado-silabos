import { deleteSubjectRequirement } from "@/server/academic/curriculumWrites"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ curriculum: string; requirement: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { curriculum, requirement } = await context.params
  return deleteSubjectRequirement(request, curriculum, requirement)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as OPTIONS }
