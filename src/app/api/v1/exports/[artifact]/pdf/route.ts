import { downloadExport } from "@/server/documents/revisionDocuments"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ artifact: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { artifact } = await context.params
  return downloadExport(request, artifact)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
