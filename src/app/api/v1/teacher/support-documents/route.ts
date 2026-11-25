import { teacherSupportDocuments } from "@/server/academic/supportDocuments"
import { unmatchedRouteHandler } from "@/server/http/router"

export function GET(request: Request): Promise<Response> {
  return teacherSupportDocuments(request)
}

export { unmatchedRouteHandler as POST, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
