import { laravelRouterHandler } from "@/server/laravel/router"
import { createConvocation } from "@/server/syllabus/convocationWrites"
import { convocations } from "@/server/syllabus/convocations"

export function GET(request: Request): Promise<Response> {
  return convocations(request)
}

export function POST(request: Request): Promise<Response> {
  return createConvocation(request)
}

export { laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
