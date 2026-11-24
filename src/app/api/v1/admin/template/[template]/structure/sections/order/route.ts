import { reorderSections } from "@/server/configuration/templateStructure"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ template: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { template } = await context.params
  return reorderSections(request, template)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
