import { scheduledSubjects } from "@/server/academic/scheduledSubjects"
import { unmatchedRouteHandler } from "@/server/http/router"

export async function GET(request: Request): Promise<Response> {
  return scheduledSubjects(request)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
