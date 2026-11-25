import { updateParallel } from "@/server/academic/careerWrites"
import { deleteParallel } from "@/server/academic/deletions"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ parallel: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { parallel } = await context.params
  return deleteParallel(request, parallel)
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { parallel } = await context.params
  return updateParallel(request, parallel)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as OPTIONS }
