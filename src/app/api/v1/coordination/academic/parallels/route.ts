import { createParallels } from "@/server/academic/careerWrites"
import { unmatchedRouteHandler } from "@/server/http/router"

export async function POST(request: Request): Promise<Response> {
  return createParallels(request)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
