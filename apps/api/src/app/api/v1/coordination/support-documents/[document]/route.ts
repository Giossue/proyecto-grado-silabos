import { deleteSupportDocument } from "@/server/academic/supportDocumentHandlers"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ document: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { document } = await context.params
  return deleteSupportDocument(request, document)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as OPTIONS }
