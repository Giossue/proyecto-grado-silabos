import { templateAssistantApply } from "@/server/ai/assistantHandlers"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ proposal: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { proposal } = await context.params
  return templateAssistantApply(request, proposal)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
