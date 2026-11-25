import { templateIndex } from "@/server/configuration/templateBuilder"
import { createTemplateHandler } from "@/server/configuration/templateProvisionerHandlers"
import { unmatchedRouteHandler } from "@/server/http/router"

export async function GET(request: Request): Promise<Response> {
  return templateIndex(request)
}

export async function POST(request: Request): Promise<Response> {
  return createTemplateHandler(request)
}

export { unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
