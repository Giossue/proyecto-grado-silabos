import { importTemplateJsonHandler } from "@/server/configuration/templateProvisionerHandlers"
import { exportTemplateJson } from "@/server/configuration/templateReads"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ template: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { template } = await context.params
  return exportTemplateJson(request, template)
}

export async function PUT(request: Request, context: Context): Promise<Response> {
  const { template } = await context.params
  return importTemplateJsonHandler(request, template)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
