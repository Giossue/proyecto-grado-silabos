import { reorderFields } from "@/server/configuration/templateStructure"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ template: string; section: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { template, section } = await context.params
  return reorderFields(request, template, section)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
