import { laravelRouterHandler } from "@/server/laravel/router"
import { teacherHistory } from "@/server/syllabus/teacherSyllabi"

export function GET(request: Request): Promise<Response> {
  return teacherHistory(request)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
