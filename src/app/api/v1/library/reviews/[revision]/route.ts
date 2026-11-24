import { laravelRouterHandler } from "@/server/laravel/router"
import { libraryReviewDetail } from "@/server/syllabus/reviewDetails"

type Context = { params: Promise<{ revision: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { revision } = await context.params
  return libraryReviewDetail(request, revision)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
