import { formatTemplateHandler } from "@/server/configuration/templateProvisionerHandlers"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ template: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { template } = await context.params
  return formatTemplateHandler(request, template)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
