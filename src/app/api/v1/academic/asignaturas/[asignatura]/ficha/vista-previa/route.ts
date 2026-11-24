import { previewSubjectProfile } from "@/server/configuration/subjectProfilePreview"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ asignatura: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { asignatura } = await context.params
  return previewSubjectProfile(request, asignatura)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
