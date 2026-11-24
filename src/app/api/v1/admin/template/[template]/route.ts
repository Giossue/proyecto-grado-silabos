import { templateShow } from "@/server/configuration/templateBuilder"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ template: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { template } = await context.params
  return templateShow(request, template)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
