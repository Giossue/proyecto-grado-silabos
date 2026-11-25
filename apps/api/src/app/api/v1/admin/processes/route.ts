import { unmatchedRouteHandler } from "@/server/http/router"
import { createProcess, syllabusProcesses } from "@/server/syllabus/processes"

export function GET(request: Request): Promise<Response> {
  return syllabusProcesses(request)
}

export function POST(request: Request): Promise<Response> {
  return createProcess(request)
}

export { unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
