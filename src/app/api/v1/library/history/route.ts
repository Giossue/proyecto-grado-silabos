import { laravelRouterHandler } from "@/server/laravel/router"
import { libraryHistory } from "@/server/library/reviews"

export function GET(request: Request): Promise<Response> {
  return libraryHistory(request)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
