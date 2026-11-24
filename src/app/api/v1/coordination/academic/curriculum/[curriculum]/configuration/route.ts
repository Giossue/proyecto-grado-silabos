import { updateCurriculumConfiguration } from "@/server/academic/curriculumWrites"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ curriculum: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  return updateCurriculumConfiguration(request, (await context.params).curriculum)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
