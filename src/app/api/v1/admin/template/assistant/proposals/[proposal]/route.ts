import { templateAssistantProposal } from "@/server/ai/assistantHandlers"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ proposal: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { proposal } = await context.params
  return templateAssistantProposal(request, proposal)
}

export { proxyToLaravel as HEAD, proxyToLaravel as POST, proxyToLaravel as PUT, proxyToLaravel as PATCH, proxyToLaravel as DELETE, proxyToLaravel as OPTIONS }
