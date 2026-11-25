import "server-only"
import { createHash } from "node:crypto"
import { fitSheetsToPageWidth } from "../files/fitPageWidth"
import { phpDirname, type StorageWriter } from "../http/storageWriter"
import type { StoredObjectInput } from "./supportDocumentWrites"

export type ViewOriginal = { disk: string; path: string; name: string; ownerId: string | null }

export interface SupportDocumentViewTx {
  lockPending(id: string): Promise<boolean>
  insertObject(row: StoredObjectInput): Promise<void>
  markReady(id: string, previewId: string): Promise<void>
}

export interface SupportDocumentViewStore {
  pending(id: string): Promise<ViewOriginal | null>
  markWithoutView(id: string): Promise<void>
  transaction<T>(work: (tx: SupportDocumentViewTx) => Promise<T>): Promise<T>
}

export type SupportDocumentViewDeps = {
  store: SupportDocumentViewStore
  storage: StorageWriter
  converterEnabled: () => boolean
  convertFile: (content: Buffer, filename: string) => Promise<Buffer>
  newObjectId: () => string
  now: () => number
  warn: (message: string, context: Record<string, string>) => void
}

function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1)
  const dot = base.lastIndexOf(".")
  return dot < 0 ? "" : base.slice(dot + 1)
}

export function phpFilename(name: string): string {
  const base = name.slice(name.lastIndexOf("/") + 1)
  const dot = base.lastIndexOf(".")
  return dot < 0 ? base : base.slice(0, dot)
}

export async function prepareSupportDocumentView(documentId: string, deps: SupportDocumentViewDeps): Promise<void> {
  const original = await deps.store.pending(documentId)
  if (original === null) return
  if (!deps.converterEnabled()) {
    await deps.store.markWithoutView(documentId)
    return
  }
  let content = await deps.storage.get(original.disk, original.path)
  const extension = extensionOf(original.path).toLowerCase()
  let filename = `documento.${extension}`
  if (extension === "xlsx" || extension === "xls") {
    try {
      if (extension !== "xlsx") throw new Error("Solo se ajustan libros .xlsx.")
      content = await fitSheetsToPageWidth(content)
      filename = "documento.xlsx"
    } catch (error) {
      deps.warn("Documento de apoyo convertido sin ajustar sus hojas.", { documento_apoyo_id: documentId, error: error instanceof Error ? error.message : String(error) })
    }
  }
  const pdf = await deps.convertFile(content, filename)
  const path = `${phpDirname(original.path)}/vista.pdf`
  await deps.storage.put(original.disk, path, pdf)
  const stored = await deps.store.transaction(async (tx) => {
    if (!(await tx.lockPending(documentId))) return false
    const previewId = deps.newObjectId()
    await tx.insertObject({
      id: previewId,
      disk: original.disk,
      path,
      name: `${phpFilename(original.name)}.pdf`,
      mime: "application/pdf",
      size: pdf.length,
      sha256: createHash("sha256").update(pdf).digest("hex"),
      classification: "documento_apoyo_vista",
      ownerId: original.ownerId,
      storedAt: deps.now(),
    })
    await tx.markReady(documentId, previewId)
    return true
  })
  if (!stored) await deps.storage.delete(original.disk, path)
}

export async function failSupportDocumentView(documentId: string, error: Error, deps: Pick<SupportDocumentViewDeps, "store" | "warn">): Promise<void> {
  await deps.store.markWithoutView(documentId)
  deps.warn("No se pudo preparar la vista del documento de apoyo.", { documento_apoyo_id: documentId, error: error.message })
}
