import { templateAssistant, templateAssistantClear } from "@/server/ai/assistantHandlers"
import { laravelRouterHandler } from "@/server/laravel/router"

export function GET(request: Request): Promise<Response> {
  return templateAssistant(request)
}

export function DELETE(request: Request): Promise<Response> {
  return templateAssistantClear(request)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as OPTIONS }
