import { curriculumBuilder } from "@/server/academic/structure"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ curriculum: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { curriculum } = await context.params
  return curriculumBuilder(request, curriculum)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
