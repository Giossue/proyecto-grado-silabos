import { proxyToLaravel } from "@/server/laravel/proxy"
import { convocationDetail } from "@/server/syllabus/convocations"

type Context = { params: Promise<{ convocation: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { convocation } = await context.params
  return convocationDetail(request, convocation)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
