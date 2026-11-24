import { laravelRouterHandler } from "@/server/laravel/router"
import { coordinationHistory } from "@/server/syllabus/coordinationReviews"

export function GET(request: Request): Promise<Response> {
  return coordinationHistory(request)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
