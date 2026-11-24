import { laravelRouterHandler } from "@/server/laravel/router"
import { createProcess, syllabusProcesses } from "@/server/syllabus/processes"

export function GET(request: Request): Promise<Response> {
  return syllabusProcesses(request)
}

export function POST(request: Request): Promise<Response> {
  return createProcess(request)
}

export { laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
