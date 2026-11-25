import { importCurriculum } from "@/server/academic/structureImports"
import { unmatchedRouteHandler } from "@/server/http/router"

export function POST(request: Request): Promise<Response> {
  return importCurriculum(request)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
