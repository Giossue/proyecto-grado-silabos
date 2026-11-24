import { deleteSubjectRequirement } from "@/server/academic/curriculumWrites"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ curriculum: string; requirement: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { curriculum, requirement } = await context.params
  return deleteSubjectRequirement(request, curriculum, requirement)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as OPTIONS,
}
