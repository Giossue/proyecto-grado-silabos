import { updateCareerRecord } from "@/server/academic/careerWrites"
import { deleteCareerRecord } from "@/server/academic/deletions"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ entity: string; record: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { entity, record } = await context.params
  return deleteCareerRecord(request, entity, record)
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { entity, record } = await context.params
  return updateCareerRecord(request, entity, record)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as OPTIONS,
}
