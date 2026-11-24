import { clearTemplateHandler } from "@/server/configuration/templateProvisionerHandlers"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ template: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { template } = await context.params
  return clearTemplateHandler(request, template)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as OPTIONS }
