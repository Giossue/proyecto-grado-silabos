"use client"

import { FileText, FolderOpen } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { type SupportDocument } from "@/api/support-documents"
import { openSupportDocument } from "@/components/domain/academic/supportDocumentViewer"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { formatDateDisplay } from "@/lib/dateDisplay"
import { teacherSupportDocumentsQuery } from "@/queries/supportDocuments"

export function SupportDocumentsButton() {
  const query = useQuery(teacherSupportDocumentsQuery())
  const documents: SupportDocument[] = query.data?.data ?? []
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const changeOpen = (value: boolean): void => {
    setOpen(value)
    if (value) void query.refetch()
  }

  const view = async (document: SupportDocument): Promise<void> => {
    if (document.view !== "lista" || busyId) return
    setBusyId(document.id)
    const opening = openSupportDocument(document)
    setOpen(false)
    try {
      await opening
    } finally {
      setBusyId(null)
    }
  }

  if (documents.length === 0 && !open) return null

  return (
    <>
      <Button type="button" variant="outline" data-labeled-tool className="max-lg:size-9 max-lg:has-[>svg]:px-0" aria-label="Documentos de apoyo" onClick={() => changeOpen(true)}>
        <FolderOpen aria-hidden="true" />
        <span className="max-lg:sr-only">Documentos de apoyo</span>
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Documentos de apoyo</DialogTitle>
            <DialogDescription>Documentación de apoyo para la elaboración del sílabo</DialogDescription>
          </DialogHeader>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Coordinación ya no tiene documentos compartidos</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-md border">
              {documents.map((document) => (
                <li key={document.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start gap-3 rounded-none px-3 py-2.5 text-left font-normal whitespace-normal"
                    aria-label={`Abrir ${document.title}`}
                    disabled={document.view !== "lista" || busyId !== null}
                    onClick={() => void view(document)}
                  >
                    {busyId === document.id ? <Spinner className="size-4 shrink-0" /> : <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{document.title}</span>
                      {document.view === "pendiente" ? (
                        <span className="text-xs text-muted-foreground">Preparando vista</span>
                      ) : document.view === "sin_vista" ? (
                        <span className="text-xs text-muted-foreground">No se pudo preparar la vista</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Actualizado el {formatDateDisplay(document.uploaded_at)}</span>
                      )}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cerrar
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
