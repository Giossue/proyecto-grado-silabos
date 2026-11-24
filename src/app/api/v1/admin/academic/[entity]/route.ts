import { academicGovernance } from "@/server/academic/governance"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ entity: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { entity } = await context.params
  return academicGovernance(request, entity)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
