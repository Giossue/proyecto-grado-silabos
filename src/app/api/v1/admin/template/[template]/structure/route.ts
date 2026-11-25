import { clearTemplateHandler } from "@/server/configuration/templateProvisionerHandlers"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ template: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { template } = await context.params
  return clearTemplateHandler(request, template)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as OPTIONS }
