import { storeField } from "@/server/configuration/templateStructure"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ template: string; section: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { template, section } = await context.params
  return storeField(request, template, section)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
