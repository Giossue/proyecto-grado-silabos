import { clearTemplateHandler } from "@/server/configuration/templateProvisionerHandlers"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ template: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { template } = await context.params
  return clearTemplateHandler(request, template)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as OPTIONS,
}
