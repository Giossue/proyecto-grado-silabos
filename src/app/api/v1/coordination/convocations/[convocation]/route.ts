import { laravelRouterHandler } from "@/server/laravel/router"
import { convocationDetail } from "@/server/syllabus/convocations"

type Context = { params: Promise<{ convocation: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { convocation } = await context.params
  return convocationDetail(request, convocation)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
