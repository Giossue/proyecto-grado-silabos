import { showSubjectProfile } from "@/server/configuration/subjectProfile"
import { updateSubjectProfile } from "@/server/configuration/subjectProfileWrites"
import { proxyToLaravel } from "@/server/laravel/proxy"

type Context = { params: Promise<{ asignatura: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { asignatura } = await context.params
  return showSubjectProfile(request, asignatura)
}

export async function PUT(request: Request, context: Context): Promise<Response> {
  const { asignatura } = await context.params
  return updateSubjectProfile(request, asignatura)
}

export { proxyToLaravel as HEAD, proxyToLaravel as POST, proxyToLaravel as PATCH, proxyToLaravel as DELETE, proxyToLaravel as OPTIONS }
