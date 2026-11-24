import { laravelRouterHandler } from "@/server/laravel/router"
import { libraryReviews } from "@/server/library/reviews"

export function GET(request: Request): Promise<Response> {
  return libraryReviews(request)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
