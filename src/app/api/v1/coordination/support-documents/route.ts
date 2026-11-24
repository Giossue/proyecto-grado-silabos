import { coordinationSupportDocuments } from "@/server/academic/supportDocuments"
import { uploadSupportDocument } from "@/server/academic/supportDocumentHandlers"
import { laravelRouterHandler } from "@/server/laravel/router"

export function GET(request: Request): Promise<Response> {
  return coordinationSupportDocuments(request)
}

export function POST(request: Request): Promise<Response> {
  return uploadSupportDocument(request)
}

export { laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
