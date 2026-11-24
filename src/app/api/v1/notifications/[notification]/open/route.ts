import { laravelRouterHandler } from "@/server/laravel/router"
import { openNotification } from "@/server/operations/notifications"

type Context = { params: Promise<{ notification: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { notification } = await context.params
  return openNotification(request, notification)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
