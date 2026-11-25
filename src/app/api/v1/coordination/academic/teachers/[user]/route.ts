import { destroyCareerTeacher } from "@/server/identity/careerTeachers"
import { unmatchedRouteHandler } from "@/server/http/router"

type Context = { params: Promise<{ user: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  return destroyCareerTeacher(request, (await context.params).user)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as OPTIONS }
