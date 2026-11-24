import { reorderFields } from "@/server/configuration/templateStructure"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ template: string; section: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { template, section } = await context.params
  return reorderFields(request, template, section)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
