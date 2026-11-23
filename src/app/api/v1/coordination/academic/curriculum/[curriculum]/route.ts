import { curriculumBuilder } from "@/server/academic/structure"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ curriculum: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { curriculum } = await context.params
  return curriculumBuilder(request, curriculum)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
