import { deleteGovernanceRecord } from "@/server/academic/deletions"
import { postGovernanceRecord, updateGovernanceRecord } from "@/server/academic/governanceWrites"
import { laravelRouterHandler } from "@/server/laravel/router"

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

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as OPTIONS }
