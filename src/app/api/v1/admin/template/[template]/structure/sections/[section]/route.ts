import { destroySection, updateSection } from "@/server/configuration/templateStructure"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ template: string; section: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { template, section } = await context.params
  return updateSection(request, template, section)
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { template, section } = await context.params
  return destroySection(request, template, section)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as OPTIONS }
