import { proxyToLaravel } from "@/server/laravel/proxy"
import { teacherHistoryCareer } from "@/server/syllabus/teacherSyllabi"

type Context = { params: Promise<{ career: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { career } = await context.params
  return teacherHistoryCareer(request, career)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
