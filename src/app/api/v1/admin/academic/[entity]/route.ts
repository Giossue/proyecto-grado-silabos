import { academicGovernance } from "@/server/academic/governance"
import { createGovernanceRecord } from "@/server/academic/governanceWrites"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ entity: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { entity } = await context.params
  return academicGovernance(request, entity)
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const { entity } = await context.params
  return createGovernanceRecord(request, entity)
}

export { unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
