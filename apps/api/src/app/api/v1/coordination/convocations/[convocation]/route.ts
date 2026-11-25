import { unmatchedRouteHandler } from "@/server/http/router"
import { convocationDetail } from "@/server/syllabus/convocations"

type Context = { params: Promise<{ convocation: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { convocation } = await context.params
  return convocationDetail(request, convocation)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
