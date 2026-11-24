import { destroyCareerTeacher } from "@/server/identity/careerTeachers"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ user: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  return destroyCareerTeacher(request, (await context.params).user)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as GET,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as OPTIONS,
}
