import { templateAssistantProposal } from "@/server/ai/assistantHandlers"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ proposal: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { proposal } = await context.params
  return templateAssistantProposal(request, proposal)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
