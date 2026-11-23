import { proxyToLaravel } from "@/server/laravel/proxy"
import { openNotification } from "@/server/operations/notifications"

type Context = { params: Promise<{ notification: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { notification } = await context.params
  return openNotification(request, notification)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
