import { laravelRouterHandler } from "@/server/laravel/router"
import { updateDraftField } from "@/server/syllabus/draftField"

type Context = { params: Promise<{ syllabus: string; field: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { syllabus, field } = await context.params
  return updateDraftField(request, syllabus, field)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
