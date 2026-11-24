import { storeField } from "@/server/configuration/templateStructure"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ template: string; section: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { template, section } = await context.params
  return storeField(request, template, section)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
