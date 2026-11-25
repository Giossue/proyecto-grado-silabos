import { setGovernanceStatus } from "@/server/academic/governanceWrites"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ entity: string; record: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { entity, record } = await context.params
  return setGovernanceStatus(request, entity, record)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
