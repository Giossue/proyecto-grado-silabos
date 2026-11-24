import { laravelRouterHandler } from "@/server/laravel/router"
import { exportProcessReport } from "@/server/syllabus/processReport"

export function GET(request: Request): Promise<Response> {
  return exportProcessReport(request)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
