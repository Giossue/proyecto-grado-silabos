import { showSupportDocument } from "@/server/academic/supportDocumentHandlers"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ document: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { document } = await context.params
  return showSupportDocument(request, document)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
