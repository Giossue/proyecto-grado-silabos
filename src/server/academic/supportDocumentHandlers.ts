import "server-only"
import { dispatchSupportDocumentView } from "./supportDocumentViewJob"
import { createSupportDocumentWriteStore } from "./supportDocumentWriteStore"
import { defaultSupportDocumentWriteDeps, destroySupportDocument, storeSupportDocument, viewSupportDocument } from "./supportDocumentWrites"

const deps = () => defaultSupportDocumentWriteDeps(createSupportDocumentWriteStore(), dispatchSupportDocumentView)

export function uploadSupportDocument(request: Request): Promise<Response> {
  return storeSupportDocument(request, deps())
}

export function deleteSupportDocument(request: Request, documentId: string): Promise<Response> {
  return destroySupportDocument(request, documentId, deps())
}

export function showSupportDocument(request: Request, documentId: string): Promise<Response> {
  return viewSupportDocument(request, documentId, deps())
}
