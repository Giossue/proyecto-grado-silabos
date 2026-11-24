import { proxyToLaravel } from "@/server/laravel/proxy"
import { copySyllabusContent } from "@/server/syllabus/draftStart"

type Context = { params: Promise<{ syllabus: string; source: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { syllabus, source } = await context.params
  return copySyllabusContent(request, syllabus, source)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
