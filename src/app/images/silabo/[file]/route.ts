import { publicSyllabusImage } from "@/server/configuration/logoRoutes"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ file: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { file } = await context.params
  return publicSyllabusImage(request, file)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
