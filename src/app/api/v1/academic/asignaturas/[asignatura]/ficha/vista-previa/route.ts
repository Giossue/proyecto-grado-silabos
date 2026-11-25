import { previewSubjectProfile } from "@/server/configuration/subjectProfilePreview"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ asignatura: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { asignatura } = await context.params
  return previewSubjectProfile(request, asignatura)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
