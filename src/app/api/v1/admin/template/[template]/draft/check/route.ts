import { checkTemplateDraft } from "@/server/configuration/templateDrafts"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ template: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { template } = await context.params
  return checkTemplateDraft(request, template)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
