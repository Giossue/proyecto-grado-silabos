import { unmatchedRouteHandler } from "@/server/http/router"
import { teacherHistoryCareer } from "@/server/syllabus/teacherSyllabi"

type Context = { params: Promise<{ career: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { career } = await context.params
  return teacherHistoryCareer(request, career)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
