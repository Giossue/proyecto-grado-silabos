import { coordinationSupportDocuments } from "@/server/academic/supportDocuments"
import { uploadSupportDocument } from "@/server/academic/supportDocumentHandlers"
import { unmatchedRouteHandler } from "@/server/http/router"

export function GET(request: Request): Promise<Response> {
  return coordinationSupportDocuments(request)
}

export function POST(request: Request): Promise<Response> {
  return uploadSupportDocument(request)
}

export { unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
