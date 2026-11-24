import { templateIndex } from "@/server/configuration/templateBuilder"
import { createTemplateHandler } from "@/server/configuration/templateProvisionerHandlers"
import { proxyToLaravel } from "@/server/laravel/proxy"

export async function GET(request: Request): Promise<Response> {
  return templateIndex(request)
}

export async function POST(request: Request): Promise<Response> {
  return createTemplateHandler(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
