import { destroySection, reorderSections } from "@/server/configuration/templateStructure"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ template: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { template } = await context.params
  return reorderSections(request, template)
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { template } = await context.params
  return destroySection(request, template, "order")
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as OPTIONS }
