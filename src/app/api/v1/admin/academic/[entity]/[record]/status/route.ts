import { setGovernanceStatus } from "@/server/academic/governanceWrites"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ entity: string; record: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { entity, record } = await context.params
  return setGovernanceStatus(request, entity, record)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
