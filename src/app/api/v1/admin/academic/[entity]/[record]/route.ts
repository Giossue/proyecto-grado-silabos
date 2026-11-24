import { deleteGovernanceRecord } from "@/server/academic/deletions"
import { postGovernanceRecord, updateGovernanceRecord } from "@/server/academic/governanceWrites"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ entity: string; record: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { entity, record } = await context.params
  return deleteGovernanceRecord(request, entity, record)
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { entity, record } = await context.params
  return updateGovernanceRecord(request, entity, record)
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const { entity, record } = await context.params
  return postGovernanceRecord(request, entity, record)
}

export { proxyToLaravel as GET, proxyToLaravel as HEAD, proxyToLaravel as PUT, proxyToLaravel as OPTIONS }
