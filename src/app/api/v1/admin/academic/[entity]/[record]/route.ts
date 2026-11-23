import { deleteGovernanceRecord } from "@/server/academic/deletions"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ entity: string; record: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { entity, record } = await context.params
  return deleteGovernanceRecord(request, entity, record)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as OPTIONS,
}
