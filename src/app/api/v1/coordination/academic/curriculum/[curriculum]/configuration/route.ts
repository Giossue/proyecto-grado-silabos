import { updateCurriculumConfiguration } from "@/server/academic/curriculumWrites"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ curriculum: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  return updateCurriculumConfiguration(request, (await context.params).curriculum)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
