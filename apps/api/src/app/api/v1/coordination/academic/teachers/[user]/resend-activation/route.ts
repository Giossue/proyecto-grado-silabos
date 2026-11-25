import { resendCareerTeacherActivation } from "@/server/identity/careerTeachers"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ user: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  return resendCareerTeacherActivation(request, (await context.params).user)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
