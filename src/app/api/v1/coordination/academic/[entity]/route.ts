import { createCareerRecord } from "@/server/academic/careerWrites"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ entity: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  return createCareerRecord(request, (await context.params).entity)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
