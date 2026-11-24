import { commentLibraryReview } from "@/server/library/reviewDecisions"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ revision: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { revision } = await context.params
  return commentLibraryReview(request, revision)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
