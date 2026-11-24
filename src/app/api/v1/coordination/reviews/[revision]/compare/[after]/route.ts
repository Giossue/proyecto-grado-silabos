import { proxyToLaravel } from "@/server/laravel/proxy"
import { compareRevisions } from "@/server/syllabus/coordinationReviews"

type Context = { params: Promise<{ revision: string; after: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { revision, after } = await context.params
  return compareRevisions(request, revision, after)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
