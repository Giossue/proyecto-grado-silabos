import { updateCareerRecord } from "@/server/academic/careerWrites"
import { deleteCareerRecord } from "@/server/academic/deletions"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ entity: string; record: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { entity, record } = await context.params
  return deleteCareerRecord(request, entity, record)
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { entity, record } = await context.params
  return updateCareerRecord(request, entity, record)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as OPTIONS }
