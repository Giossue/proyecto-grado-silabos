import { proxyToLaravel } from "@/server/laravel/proxy"
import { processImpact } from "@/server/syllabus/processes"

type Context = { params: Promise<{ process: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { process } = await context.params
  return processImpact(request, process)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
