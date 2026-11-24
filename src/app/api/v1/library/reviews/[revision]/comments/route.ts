import { commentLibraryReview } from "@/server/library/reviewDecisions"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ revision: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { revision } = await context.params
  return commentLibraryReview(request, revision)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
