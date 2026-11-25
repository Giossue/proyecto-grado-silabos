import { showSupportDocument } from "@/server/academic/supportDocumentHandlers"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ document: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { document } = await context.params
  return showSupportDocument(request, document)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
