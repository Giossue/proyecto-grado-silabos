import { requestRevisionDocuments, revisionDocuments } from "@/server/documents/revisionDocuments"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ revision: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { revision } = await context.params
  return revisionDocuments(request, revision)
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const { revision } = await context.params
  return requestRevisionDocuments(request, revision)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
