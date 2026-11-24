import { facultyLogo } from "@/server/configuration/logoRoutes"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ faculty: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { faculty } = await context.params
  return facultyLogo(request, faculty)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
