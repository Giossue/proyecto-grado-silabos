import { academicGovernance } from "@/server/academic/governance"
import { createGovernanceRecord } from "@/server/academic/governanceWrites"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ entity: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { entity } = await context.params
  return academicGovernance(request, entity)
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const { entity } = await context.params
  return createGovernanceRecord(request, entity)
}

export { laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
