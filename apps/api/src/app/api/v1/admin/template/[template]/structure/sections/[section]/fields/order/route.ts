import { reorderFields } from "@/server/configuration/templateStructure"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ template: string; section: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { template, section } = await context.params
  return reorderFields(request, template, section)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
