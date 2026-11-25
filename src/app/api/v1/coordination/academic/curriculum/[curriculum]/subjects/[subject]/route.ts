import { deleteCurriculumSubject } from "@/server/academic/curriculumWrites"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ curriculum: string; subject: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { curriculum, subject } = await context.params
  return deleteCurriculumSubject(request, curriculum, subject)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as OPTIONS }
