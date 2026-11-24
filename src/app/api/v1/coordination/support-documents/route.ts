import { coordinationSupportDocuments } from "@/server/academic/supportDocuments"
import { uploadSupportDocument } from "@/server/academic/supportDocumentHandlers"
import { proxyToLaravel } from "@/server/laravel/proxy"

export function GET(request: Request): Promise<Response> {
  return coordinationSupportDocuments(request)
}

export function POST(request: Request): Promise<Response> {
  return uploadSupportDocument(request)
}

export {
  proxyToLaravel as HEAD,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
