import { replaceParallelTeacher } from "@/server/academic/careerWrites"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ parallel: string }> }

export async function PUT(request: Request, context: Context): Promise<Response> {
  return replaceParallelTeacher(request, (await context.params).parallel)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
