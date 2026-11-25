import { importTemplateJsonHandler } from "@/server/configuration/templateProvisionerHandlers"
import { exportTemplateJson } from "@/server/configuration/templateReads"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ template: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { template } = await context.params
  return exportTemplateJson(request, template)
}

export async function PUT(request: Request, context: Context): Promise<Response> {
  const { template } = await context.params
  return importTemplateJsonHandler(request, template)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
