import { storeField } from "@/server/configuration/templateStructure"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ template: string; section: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { template, section } = await context.params
  return storeField(request, template, section)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
