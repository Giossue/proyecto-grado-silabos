import { deleteCurriculumSubject } from "@/server/academic/curriculumWrites"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ curriculum: string; subject: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { curriculum, subject } = await context.params
  return deleteCurriculumSubject(request, curriculum, subject)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as OPTIONS,
}
