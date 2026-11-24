import { requestRevisionDocuments, revisionDocuments } from "@/server/documents/revisionDocuments"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ revision: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { revision } = await context.params
  return revisionDocuments(request, revision)
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const { revision } = await context.params
  return requestRevisionDocuments(request, revision)
}

export { laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
