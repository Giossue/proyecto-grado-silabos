import { unmatchedRouteHandler } from "@/server/http/router"
import { openNotification } from "@/server/operations/notifications"

type Context = { params: Promise<{ notification: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { notification } = await context.params
  return openNotification(request, notification)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
