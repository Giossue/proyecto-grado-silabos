import { deleteSupportDocument } from "@/server/academic/supportDocumentHandlers"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ document: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { document } = await context.params
  return deleteSupportDocument(request, document)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as OPTIONS }
