import { destroyField, updateField } from "@/server/configuration/templateStructure"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ template: string; field: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { template, field } = await context.params
  return updateField(request, template, field)
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { template, field } = await context.params
  return destroyField(request, template, field)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as OPTIONS,
}
