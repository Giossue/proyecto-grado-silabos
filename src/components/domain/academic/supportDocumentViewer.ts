import { ApiError } from "@/api/client"
import { viewSupportDocument, type SupportDocument } from "@/api/support-documents"
import { openPdfWindow, showInPdfWindow } from "@/lib/openPdf"
import { toast } from "@/lib/toast"

export const supportDocumentSize = (bytes: number): string =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

export const openSupportDocument = async (document: SupportDocument): Promise<void> => {
  const tab = openPdfWindow()
  try {
    const url = URL.createObjectURL(await viewSupportDocument(document.id))
    showInPdfWindow(tab, url)
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (reason) {
    tab?.close()
    toast.error(reason instanceof ApiError ? reason.message : "No se pudo abrir el documento")
  }
}
