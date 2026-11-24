import { createParallels } from "@/server/academic/careerWrites"
import { laravelRouterHandler } from "@/server/laravel/router"

export async function POST(request: Request): Promise<Response> {
  return createParallels(request)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
