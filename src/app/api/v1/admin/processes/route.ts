import { proxyToLaravel } from "@/server/laravel/proxy"
import { createProcess, syllabusProcesses } from "@/server/syllabus/processes"

export function GET(request: Request): Promise<Response> {
  return syllabusProcesses(request)
}

export function POST(request: Request): Promise<Response> {
  return createProcess(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
