import { importTemplateJsonHandler } from "@/server/configuration/templateProvisionerHandlers"
import { exportTemplateJson } from "@/server/configuration/templateReads"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ template: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { template } = await context.params
  return exportTemplateJson(request, template)
}

export async function PUT(request: Request, context: Context): Promise<Response> {
  const { template } = await context.params
  return importTemplateJsonHandler(request, template)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
