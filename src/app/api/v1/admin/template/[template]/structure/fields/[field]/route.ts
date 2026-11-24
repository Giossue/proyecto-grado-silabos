import { destroyField, updateField } from "@/server/configuration/templateStructure"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ template: string; field: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { template, field } = await context.params
  return updateField(request, template, field)
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { template, field } = await context.params
  return destroyField(request, template, field)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as OPTIONS }
