import { templateAssistantDiscard } from "@/server/ai/assistantHandlers"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ proposal: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { proposal } = await context.params
  return templateAssistantDiscard(request, proposal)
}

export { proxyToLaravel as GET, proxyToLaravel as HEAD, proxyToLaravel as PUT, proxyToLaravel as PATCH, proxyToLaravel as DELETE, proxyToLaravel as OPTIONS }
