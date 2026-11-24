import { downloadExport } from "@/server/documents/revisionDocuments"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ artifact: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { artifact } = await context.params
  return downloadExport(request, artifact)
}

export {
  proxyToLaravel as POST,
  proxyToLaravel as HEAD,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
