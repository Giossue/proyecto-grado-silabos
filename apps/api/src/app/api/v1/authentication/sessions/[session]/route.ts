import { destroySession } from "@/server/identity/selfService"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ session: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  return destroySession(request, (await context.params).session)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as OPTIONS }
