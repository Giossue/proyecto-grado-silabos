import { templateAssistantProposal } from "@/server/ai/assistantHandlers"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ proposal: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { proposal } = await context.params
  return templateAssistantProposal(request, proposal)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
