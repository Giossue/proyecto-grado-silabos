import { setGovernanceStatus } from "@/server/academic/governanceWrites"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ entity: string; record: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { entity, record } = await context.params
  return setGovernanceStatus(request, entity, record)
}

export { proxyToLaravel as GET, proxyToLaravel as HEAD, proxyToLaravel as POST, proxyToLaravel as PUT, proxyToLaravel as DELETE, proxyToLaravel as OPTIONS }
