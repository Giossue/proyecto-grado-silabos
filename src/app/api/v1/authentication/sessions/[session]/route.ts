import { destroySession } from "@/server/identity/selfService"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ session: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  return destroySession(request, (await context.params).session)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as OPTIONS }
