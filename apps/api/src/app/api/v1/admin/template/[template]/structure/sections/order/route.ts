import { destroySection, reorderSections } from "@/server/configuration/templateStructure"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ template: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { template } = await context.params
  return reorderSections(request, template)
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { template } = await context.params
  return destroySection(request, template, "order")
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as OPTIONS }
