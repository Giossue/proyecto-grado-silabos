import { deleteSupportDocument } from "@/server/academic/supportDocumentHandlers"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ document: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { document } = await context.params
  return deleteSupportDocument(request, document)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as OPTIONS,
}
