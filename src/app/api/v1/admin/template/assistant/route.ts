import { templateAssistant, templateAssistantClear } from "@/server/ai/assistantHandlers"
import { unmatchedRouteHandler } from "@/server/http/router"

export function GET(request: Request): Promise<Response> {
  return templateAssistant(request)
}

export function DELETE(request: Request): Promise<Response> {
  return templateAssistantClear(request)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as OPTIONS }
