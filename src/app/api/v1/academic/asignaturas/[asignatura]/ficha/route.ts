import { showSubjectProfile } from "@/server/configuration/subjectProfile"
import { updateSubjectProfile } from "@/server/configuration/subjectProfileWrites"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ asignatura: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { asignatura } = await context.params
  return showSubjectProfile(request, asignatura)
}

export async function PUT(request: Request, context: Context): Promise<Response> {
  const { asignatura } = await context.params
  return updateSubjectProfile(request, asignatura)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
