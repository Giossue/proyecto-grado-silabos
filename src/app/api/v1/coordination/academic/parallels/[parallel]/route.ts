import { updateParallel } from "@/server/academic/careerWrites"
import { deleteParallel } from "@/server/academic/deletions"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ parallel: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { parallel } = await context.params
  return deleteParallel(request, parallel)
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { parallel } = await context.params
  return updateParallel(request, parallel)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as OPTIONS }
