import { previewSubjectProfile } from "@/server/configuration/subjectProfilePreview"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ asignatura: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { asignatura } = await context.params
  return previewSubjectProfile(request, asignatura)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
