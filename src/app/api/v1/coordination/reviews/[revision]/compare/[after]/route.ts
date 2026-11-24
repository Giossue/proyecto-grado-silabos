import { laravelRouterHandler } from "@/server/laravel/router"
import { compareRevisions } from "@/server/syllabus/coordinationReviews"

type Context = { params: Promise<{ revision: string; after: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { revision, after } = await context.params
  return compareRevisions(request, revision, after)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
