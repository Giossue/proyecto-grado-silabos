import { unmatchedRouteHandler } from "@/server/http/router"
import { createConvocation } from "@/server/syllabus/convocationWrites"
import { convocations } from "@/server/syllabus/convocations"

export function GET(request: Request): Promise<Response> {
  return convocations(request)
}

export function POST(request: Request): Promise<Response> {
  return createConvocation(request)
}

export { unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
