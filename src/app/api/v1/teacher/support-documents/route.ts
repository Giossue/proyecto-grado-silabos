import { teacherSupportDocuments } from "@/server/academic/supportDocuments"
import { laravelRouterHandler } from "@/server/laravel/router"

export function GET(request: Request): Promise<Response> {
  return teacherSupportDocuments(request)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
