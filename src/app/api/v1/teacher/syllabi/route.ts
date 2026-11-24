import { proxyToLaravel } from "@/server/laravel/proxy"
import { teacherSyllabi } from "@/server/syllabus/teacherSyllabi"

export function GET(request: Request): Promise<Response> {
  return teacherSyllabi(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
