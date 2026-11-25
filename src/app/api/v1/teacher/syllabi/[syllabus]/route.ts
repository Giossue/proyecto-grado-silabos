import { unmatchedRouteHandler } from "@/server/http/router"
import { teacherSyllabusDetail } from "@/server/syllabus/syllabusDetail"

type Context = { params: Promise<{ syllabus: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { syllabus } = await context.params
  return teacherSyllabusDetail(request, syllabus)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
