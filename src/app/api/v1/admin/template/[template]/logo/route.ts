import { uploadTemplateLogo } from "@/server/configuration/templateLogo"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ template: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { template } = await context.params
  return uploadTemplateLogo(request, template)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
