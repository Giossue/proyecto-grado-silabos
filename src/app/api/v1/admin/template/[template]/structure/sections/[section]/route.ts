import { destroySection, updateSection } from "@/server/configuration/templateStructure"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ template: string; section: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { template, section } = await context.params
  return updateSection(request, template, section)
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { template, section } = await context.params
  return destroySection(request, template, section)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as OPTIONS,
}
