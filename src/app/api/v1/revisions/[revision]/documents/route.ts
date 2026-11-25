import { requestRevisionDocuments, revisionDocuments } from "@/server/documents/revisionDocuments"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ revision: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { revision } = await context.params
  return revisionDocuments(request, revision)
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const { revision } = await context.params
  return requestRevisionDocuments(request, revision)
}

export { unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
