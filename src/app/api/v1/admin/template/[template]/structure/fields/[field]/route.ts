import { destroyField, updateField } from "@/server/configuration/templateStructure"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ template: string; field: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { template, field } = await context.params
  return updateField(request, template, field)
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { template, field } = await context.params
  return destroyField(request, template, field)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as OPTIONS }
