import { proxyToLaravel } from "@/server/laravel/proxy"
import { teacherSyllabusDetail } from "@/server/syllabus/syllabusDetail"

type Context = { params: Promise<{ syllabus: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { syllabus } = await context.params
  return teacherSyllabusDetail(request, syllabus)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
