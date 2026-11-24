import { templateAssistant, templateAssistantClear } from "@/server/ai/assistantHandlers"
import { proxyToLaravel } from "@/server/laravel/proxy"

export function GET(request: Request): Promise<Response> {
  return templateAssistant(request)
}

export function DELETE(request: Request): Promise<Response> {
  return templateAssistantClear(request)
}

export { proxyToLaravel as HEAD, proxyToLaravel as POST, proxyToLaravel as PUT, proxyToLaravel as PATCH, proxyToLaravel as OPTIONS }
