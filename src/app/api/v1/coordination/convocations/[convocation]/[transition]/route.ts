import { proxyToLaravel } from "@/server/laravel/proxy"
import { pauseConvocation } from "@/server/syllabus/convocations"

type Context = { params: Promise<{ convocation: string; transition: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { convocation, transition } = await context.params
  return transition === "pausar" ? pauseConvocation(request, convocation) : proxyToLaravel(request)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
