import { templateAssistantDiscard } from "@/server/ai/assistantHandlers"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ proposal: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { proposal } = await context.params
  return templateAssistantDiscard(request, proposal)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
