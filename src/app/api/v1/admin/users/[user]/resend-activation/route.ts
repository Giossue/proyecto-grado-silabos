import { resendManagedUserActivation } from "@/server/identity/accountWrites"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ user: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  return resendManagedUserActivation(request, (await context.params).user)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
