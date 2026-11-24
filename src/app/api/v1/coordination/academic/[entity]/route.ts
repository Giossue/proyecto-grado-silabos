import { createCareerRecord } from "@/server/academic/careerWrites"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ entity: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  return createCareerRecord(request, (await context.params).entity)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
