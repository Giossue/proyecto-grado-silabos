"use client"

import { Trash2, Upload } from "lucide-react"
import { useEffect, useEffectEvent, useState, type FormEvent, type KeyboardEvent } from "react"
import { ApiError } from "@/api/client"
import { deleteSupportDocument, getCoordinationSupportDocuments, getTeacherSupportDocuments, uploadSupportDocument, type SupportDocument } from "@/api/support-documents"
import { openSupportDocument, supportDocumentSize } from "@/components/domain/academic/supportDocumentViewer"
import { ClientFilterBar } from "@/components/domain/ClientFilterBar"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { FileDropzone } from "@/components/domain/FileDropzone"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { TableCardLine } from "@/components/domain/TableCardLine"
import { TablePagination } from "@/components/domain/TablePagination"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useClientFilter } from "@/composables/useClientFilter"
import { useClientPagination } from "@/composables/useClientPagination"
import { useModelOpen, useOpened } from "@/composables/useModelOpen"
import { formatDateDisplay } from "@/lib/dateDisplay"
import { useShownWhileClosing } from "@/lib/dialogExit"
import { activateRow } from "@/lib/rowActivation"
import { toast } from "@/lib/toast"

type SupportDocumentsPanelProps = {
  manages: boolean
  uploadOpen?: boolean
  onUploadOpenChange?: (open: boolean) => void
  onLoadingChange?: (loading: boolean) => void
}

const MAX_BYTES = 20 * 1024 * 1024
const POLL_MS = 4000
const searchable = (document: SupportDocument) => [document.title]

export function SupportDocumentsPanel({ manages, uploadOpen, onUploadOpenChange, onLoadingChange }: SupportDocumentsPanelProps) {
  const [documents, setDocuments] = useState<SupportDocument[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [isUploadOpen, setUploadOpen] = useModelOpen(uploadOpen, onUploadOpenChange)
  const [title, setTitle] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState<SupportDocument | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [removeProcessing, setRemoveProcessing] = useState(false)
  const removingShown = useShownWhileClosing(removing)
  const filter = useClientFilter(documents, searchable)
  const pagination = useClientPagination(filter.items, 20, filter.criteria)
  const initialLoading = loading && !loaded && !loadError
  const pending = documents.some((document) => document.view === "pendiente")

  useOpened(isUploadOpen, () => {
    setTitle("")
    setFile(null)
    setFileError(null)
    setUploadError(null)
  })

  const requestDocuments = (): Promise<{ data: SupportDocument[] }> => (manages ? getCoordinationSupportDocuments() : getTeacherSupportDocuments())

  const applyDocuments = (data: SupportDocument[]): void => {
    setDocuments(data)
    setLoaded(true)
    setLoading(false)
  }

  const applyFailure = (reason: unknown, quiet: boolean): void => {
    if (!quiet) setLoadError(reason instanceof ApiError ? reason.message : "No se pudieron cargar los documentos")
    setLoading(false)
  }

  const fetchDocuments = async (quiet: boolean): Promise<void> => {
    try {
      applyDocuments((await requestDocuments()).data)
    } catch (reason) {
      applyFailure(reason, quiet)
    }
  }

  const reload = (): void => {
    setLoading(true)
    setLoadError(null)
    void fetchDocuments(false)
  }

  const firstRequest = useEffectEvent(requestDocuments)
  const firstLoaded = useEffectEvent(applyDocuments)
  const firstFailed = useEffectEvent((reason: unknown): void => applyFailure(reason, false))
  const quietLoad = useEffectEvent((): void => void fetchDocuments(true))
  const announceLoading = useEffectEvent((value: boolean): void => onLoadingChange?.(value))

  useEffect(() => {
    void firstRequest()
      .then((response) => firstLoaded(response.data))
      .catch((reason: unknown) => firstFailed(reason))
  }, [])

  useEffect(() => {
    announceLoading(initialLoading)
  }, [initialLoading])

  useEffect(() => {
    if (!pending) return
    const poll = window.setInterval(quietLoad, POLL_MS)

    return () => window.clearInterval(poll)
  }, [pending])

  const view = async (document: SupportDocument): Promise<void> => {
    if (document.view !== "lista" || busyId) return
    setBusyId(document.id)
    try {
      await openSupportDocument(document)
    } finally {
      setBusyId(null)
    }
  }

  const viewFromKeyboard = (event: KeyboardEvent<HTMLTableRowElement>, document: SupportDocument): void => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return
    event.preventDefault()
    void view(document)
  }

  const pickFile = (picked: File | null): void => {
    setFile(picked)
    setFileError(null)
  }

  const upload = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!file || !title.trim()) return
    setUploading(true)
    setUploadError(null)
    try {
      const { document } = await uploadSupportDocument(title.trim(), file)
      setDocuments((current) => [document, ...current])
      setUploadOpen(false)
      toast.success("Documento subido")
    } catch (reason) {
      setUploadError(reason instanceof ApiError ? (Object.values(reason.errors)[0]?.[0] ?? reason.message) : "No se pudo subir el documento")
    } finally {
      setUploading(false)
    }
  }

  const askRemoval = (document: SupportDocument): void => {
    setRemoveError(null)
    setRemoving(document)
  }

  const remove = async (): Promise<void> => {
    const target = removing
    if (!target) return
    setRemoveProcessing(true)
    try {
      await deleteSupportDocument(target.id)
      setDocuments((current) => current.filter((document) => document.id !== target.id))
      setRemoving(null)
      toast.success("Documento eliminado")
    } catch (reason) {
      setRemoveError(reason instanceof ApiError ? reason.message : "No se pudo eliminar el documento")
    } finally {
      setRemoveProcessing(false)
    }
  }

  const uploadedOn = (document: SupportDocument): string => formatDateDisplay(document.uploaded_at, { dateStyle: "medium" })

  return (
    <div className="flex flex-col gap-4">
      {loadError ? (
        <LoadErrorState message={loadError} onRetry={reload} />
      ) : loading && !loaded ? (
        <LoadingSkeleton variant="table" rows={4} columns={manages ? 4 : 3} actions={manages} cellLines={[2, 1, 1]} />
      ) : (
        <div className="flex flex-col gap-4">
          <ClientFilterBar filter={filter} inputId="support-documents-search" label="Buscar documento" placeholder="Buscar documento" />
          <Table label="Documentos de apoyo">
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead className="text-center">Tamaño</TableHead>
                <TableHead>Subido</TableHead>
                {manages ? <TableHead className="text-center">Acciones</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!filter.items.length ? (
                <TableEmpty colSpan={manages ? 4 : 3}>
                  {filter.active ? "Ningún documento coincide con la búsqueda" : manages ? "Todavía no hay documentos" : "Coordinación todavía no ha subido documentos"}
                </TableEmpty>
              ) : (
                pagination.items.map((document) => (
                  <TableRow
                    key={document.id}
                    className={document.view === "lista" ? "cursor-pointer" : undefined}
                    tabIndex={document.view === "lista" ? 0 : undefined}
                    aria-label={document.view === "lista" ? `Ver ${document.title}` : undefined}
                    onClick={(event) => activateRow(event.nativeEvent, () => void view(document))}
                    onKeyDown={(event) => viewFromKeyboard(event, document)}
                  >
                    <TableCell>
                      <span>{document.title}</span>
                      {document.view === "pendiente" ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Spinner aria-hidden="true" />
                          Preparando vista
                        </span>
                      ) : document.view === "sin_vista" ? (
                        <span className="block text-xs text-muted-foreground">No se pudo preparar la vista</span>
                      ) : null}
                      <TableCardLine>
                        {supportDocumentSize(document.size)} · {uploadedOn(document)}
                      </TableCardLine>
                    </TableCell>
                    <TableCell className="text-center" data-card-hide="true">
                      {supportDocumentSize(document.size)}
                    </TableCell>
                    <TableCell data-card-hide="true">{uploadedOn(document)}</TableCell>
                    {manages ? (
                      <TableCell className="text-center" data-card-no-label="true">
                        <IconTooltip label="Eliminar">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                            aria-label={`Eliminar ${document.title}`}
                            onClick={() => askRemoval(document)}
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </IconTooltip>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePagination meta={pagination.meta} label="Paginación de documentos de apoyo" onPageChange={pagination.setPage} />
        </div>
      )}

      {manages ? (
        <Dialog open={isUploadOpen} onOpenChange={setUploadOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Subir documento</DialogTitle>
              <DialogDescription>PDF, Word o Excel de hasta 20 MB</DialogDescription>
            </DialogHeader>
            <form className="flex flex-col gap-4" data-testid="support-document-form" onSubmit={(event) => void upload(event)}>
              <Field data-invalid={Boolean(fileError)}>
                <FieldLabel htmlFor="support-document-file" required>
                  Archivo
                </FieldLabel>
                <FileDropzone
                  value={file}
                  onValueChange={pickFile}
                  inputId="support-document-file"
                  kind="document"
                  maxBytes={MAX_BYTES}
                  disabled={uploading}
                  invalid={Boolean(fileError)}
                  state={uploading ? "uploading" : "idle"}
                  onValidationError={setFileError}
                />
                {fileError ? <FieldError errors={[fileError]} /> : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="support-document-title" required>
                  Nombre
                </FieldLabel>
                <Input id="support-document-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} autoComplete="off" disabled={uploading} />
              </Field>
              {uploadError ? <FeedbackAlert message={uploadError} /> : null}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={uploading}>
                    Cancelar
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={uploading || !file || !title.trim()}>
                  {uploading ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" aria-hidden="true" />}
                  Subir
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {manages ? (
        <Dialog
          open={removing !== null}
          onOpenChange={(open) => {
            if (!open) setRemoving(null)
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Eliminar {removingShown?.title}</DialogTitle>
              <DialogDescription>Los docentes dejarán de verlo</DialogDescription>
            </DialogHeader>
            {removeError ? <FeedbackAlert message={removeError} /> : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="button" variant="destructive" disabled={removeProcessing} onClick={() => void remove()}>
                {removeProcessing ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}
                Eliminar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}
