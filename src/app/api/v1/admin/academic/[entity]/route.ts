import { academicGovernance } from "@/server/academic/governance"
import { createGovernanceRecord } from "@/server/academic/governanceWrites"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ entity: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { entity } = await context.params
  return academicGovernance(request, entity)
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const { entity } = await context.params
  return createGovernanceRecord(request, entity)
}

export { proxyToLaravel as HEAD, proxyToLaravel as PUT, proxyToLaravel as PATCH, proxyToLaravel as DELETE, proxyToLaravel as OPTIONS }
