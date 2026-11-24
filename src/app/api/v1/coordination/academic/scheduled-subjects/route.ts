import { scheduledSubjects } from "@/server/academic/scheduledSubjects"
import { laravelRouterHandler } from "@/server/laravel/router"

export async function GET(request: Request): Promise<Response> {
  return scheduledSubjects(request)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
