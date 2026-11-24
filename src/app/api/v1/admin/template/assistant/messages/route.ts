import { templateAssistantMessage } from "@/server/ai/assistantHandlers"
import { proxyToLaravel } from "@/server/laravel/proxy"

export function POST(request: Request): Promise<Response> {
  return templateAssistantMessage(request)
}

export { proxyToLaravel as GET, proxyToLaravel as HEAD, proxyToLaravel as PUT, proxyToLaravel as PATCH, proxyToLaravel as DELETE, proxyToLaravel as OPTIONS }
