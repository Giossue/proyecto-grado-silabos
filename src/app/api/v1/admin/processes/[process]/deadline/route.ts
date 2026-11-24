import { proxyToLaravel } from "@/server/laravel/proxy"
import { extendProcessDeadline } from "@/server/syllabus/processWrites"

type Context = { params: Promise<{ process: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { process } = await context.params
  return extendProcessDeadline(request, process)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
