import { resendCareerTeacherActivation } from "@/server/identity/careerTeachers"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ user: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  return resendCareerTeacherActivation(request, (await context.params).user)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as GET,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
