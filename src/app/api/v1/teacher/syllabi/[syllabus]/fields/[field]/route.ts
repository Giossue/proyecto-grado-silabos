import { proxyToLaravel } from "@/server/laravel/proxy"
import { updateDraftField } from "@/server/syllabus/draftField"

type Context = { params: Promise<{ syllabus: string; field: string }> }

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { syllabus, field } = await context.params
  return updateDraftField(request, syllabus, field)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
