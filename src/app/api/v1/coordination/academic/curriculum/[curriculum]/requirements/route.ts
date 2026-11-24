import { createSubjectRequirement } from "@/server/academic/curriculumWrites"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ curriculum: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  return createSubjectRequirement(request, (await context.params).curriculum)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
