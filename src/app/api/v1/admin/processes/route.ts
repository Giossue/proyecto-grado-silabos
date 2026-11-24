import { proxyToLaravel } from "@/server/laravel/proxy"
import { syllabusProcesses } from "@/server/syllabus/processes"

export function GET(request: Request): Promise<Response> {
  return syllabusProcesses(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
