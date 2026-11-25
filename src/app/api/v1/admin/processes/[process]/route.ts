import { unmatchedRouteHandler } from "@/server/http/router"
import { deleteProcess } from "@/server/syllabus/processWrites"

type Context = { params: Promise<{ process: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { process } = await context.params
  return deleteProcess(request, process)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as OPTIONS }
