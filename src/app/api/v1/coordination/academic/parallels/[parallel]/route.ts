import { updateParallel } from "@/server/academic/careerWrites"
import { deleteParallel } from "@/server/academic/deletions"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ parallel: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { parallel } = await context.params
  return deleteParallel(request, parallel)
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { parallel } = await context.params
  return updateParallel(request, parallel)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as OPTIONS,
}
