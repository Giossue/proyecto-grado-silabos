"use client"

import { Trash2, Upload } from "lucide-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useEffectEvent, useState } from "react"
import { ApiError } from "@/api/client"
import { deleteSupportDocument, uploadSupportDocument, type SupportDocument } from "@/api/support-documents"
import { openSupportDocument, supportDocumentSize } from "@/components/domain/academic/supportDocumentViewer"
import { ClientFilterBar } from "@/components/domain/ClientFilterBar"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { FileDropzone } from "@/components/domain/FileDropzone"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { TableCardLine } from "@/components/domain/TableCardLine"
import { TablePagination } from "@/components/domain/TablePagination"
import { SortableHead, SortStatus } from "@/components/domain/TableSort"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useClientFilter } from "@/composables/useClientFilter"
import { useClientPagination } from "@/composables/useClientPagination"
import { useTableSort, type SortColumns } from "@/composables/useTableSort"
import { useModelOpen, useOpened } from "@/composables/useModelOpen"
import { formatDateDisplay } from "@/lib/dateDisplay"
import { useShownWhileClosing } from "@/lib/dialogExit"
import { activateRow, rowButtonClass } from "@/lib/rowActivation"
import { SERVER_ERROR, fieldMessage, serverMessage, useSchemaForm } from "@/lib/forms"
import { errorMessage, failedQuery } from "@/lib/queryClient"
import { toast } from "@/lib/toast"
import { coordinationSupportDocumentsQuery, teacherSupportDocumentsQuery } from "@/queries/supportDocuments"
import { supportDocumentFormSchema } from "@silabos/shared/schemas/academic"

type SupportDocumentsPanelProps = {
  manages: boolean
  uploadOpen?: boolean
  onUploadOpenChange?: (open: boolean) => void
  onLoadingChange?: (loading: boolean) => void
}

const MAX_BYTES = 20 * 1024 * 1024
const POLL_MS = 4000
const EMPTY_UPLOAD = { file: null, title: "" }
const NO_DOCUMENTS: SupportDocument[] = []
const searchable = (document: SupportDocument) => [document.title]
const sortColumns = {
  title: { label: "Documento", value: (document: SupportDocument) => document.title },
  size: { label: "Tamaño", type: "number", value: (document: SupportDocument) => document.size },
  uploaded: { label: "Subido", type: "date", value: (document: SupportDocument) => document.uploaded_at },
} satisfies SortColumns<SupportDocument>

export function SupportDocumentsPanel({ manages, uploadOpen, onUploadOpenChange, onLoadingChange }: SupportDocumentsPanelProps) {
  const queryClient = useQueryClient()
  const listQuery: { queryKey: readonly string[]; queryFn: () => Promise<{ data: SupportDocument[] }> } = manages ? coordinationSupportDocumentsQuery() : teacherSupportDocumentsQuery()
  const query = useQuery({
    ...listQuery,
    refetchInterval: (current) => ((current.state.data?.data ?? NO_DOCUMENTS).some((document) => document.view === "pendiente") ? POLL_MS : false),
  })
  const documents = query.data?.data ?? NO_DOCUMENTS
  const loaded = query.data !== undefined
  const loading = !loaded && !failedQuery(query)
  const loadError = !loaded && failedQuery(query) ? errorMessage(query.error, "No se pudieron cargar los documentos") : null
  const [busyId, setBusyId] = useState<string | null>(null)
  const [isUploadOpen, setUploadOpen] = useModelOpen(uploadOpen, onUploadOpenChange)
  const uploadForm = useSchemaForm(supportDocumentFormSchema, { defaultValues: EMPTY_UPLOAD })
  const title = String(uploadForm.watch("title") ?? "")
  const file = uploadForm.watch("file") ?? null
  const fileError = fieldMessage(uploadForm.formState.errors, "file") ?? null
  const uploadError = serverMessage(uploadForm.formState.errors) ?? fieldMessage(uploadForm.formState.errors, "title") ?? null
  const uploading = uploadForm.formState.isSubmitting
  const [removing, setRemoving] = useState<SupportDocument | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [removeProcessing, setRemoveProcessing] = useState(false)
  const removingShown = useShownWhileClosing(removing)
  const filter = useClientFilter(documents, searchable)
  const sort = useTableSort(filter.items, sortColumns)
  const pagination = useClientPagination(sort.items, 20, `${filter.criteria}|${sort.criteria}`)
  const initialLoading = loading

  useOpened(isUploadOpen, () => uploadForm.reset(EMPTY_UPLOAD))

  const setDocuments = (update: (current: SupportDocument[]) => SupportDocument[]): void => {
    queryClient.setQueryData(listQuery.queryKey, (current: { data: SupportDocument[] } | undefined) => ({ ...current, data: update(current?.data ?? NO_DOCUMENTS) }))
  }

  const reload = (): void => {
    void query.refetch()
  }

  const announceLoading = useEffectEvent((value: boolean): void => onLoadingChange?.(value))

  useEffect(() => {
    announceLoading(initialLoading)
  }, [initialLoading])

  const view = async (document: SupportDocument): Promise<void> => {
    if (document.view !== "lista" || busyId) return
    setBusyId(document.id)
    try {
      await openSupportDocument(document)
    } finally {
      setBusyId(null)
    }
  }

  const pickFile = (picked: File | null): void => {
    uploadForm.setValue("file", picked)
    uploadForm.clearErrors("file")
  }

  const setFileError = (message: string | null): void => {
    if (message) uploadForm.setError("file", { type: "client", message })
    else uploadForm.clearErrors("file")
  }

  const upload = uploadForm.handleSubmit(async ({ title: name, file: picked }) => {
    if (!picked) return
    try {
      const { document } = await uploadSupportDocument(name, picked)
      setDocuments((current) => [document, ...current])
      setUploadOpen(false)
      toast.success("Documento subido")
    } catch (reason) {
      uploadForm.setError(SERVER_ERROR, { type: "server", message: reason instanceof ApiError ? (Object.values(reason.errors)[0]?.[0] ?? reason.message) : "No se pudo subir el documento" })
    }
  })

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
      ) : loading ? (
        <LoadingSkeleton variant="table" rows={4} columns={manages ? 4 : 3} actions={manages} cellLines={[2, 1, 1]} />
      ) : (
        <div className="flex flex-col gap-4">
          <ClientFilterBar filter={filter} inputId="support-documents-search" label="Buscar documento" placeholder="Buscar documento" sort={sort} />
          <Table label="Documentos de apoyo">
            <TableHeader>
              <TableRow>
                <SortableHead sort={sort} column="title">Documento</SortableHead>
                <SortableHead sort={sort} column="size" className="text-center">Tamaño</SortableHead>
                <SortableHead sort={sort} column="uploaded">Subido</SortableHead>
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
                    onClick={(event) => activateRow(event.nativeEvent, () => void view(document))}
                  >
                    <TableCell>
                      {document.view === "lista" ? (
                        <button type="button" className={rowButtonClass} onClick={() => void view(document)}>{document.title}</button>
                      ) : (
                        <span>{document.title}</span>
                      )}
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
          <SortStatus sort={sort} />
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
            <form className="flex flex-col gap-4" data-testid="support-document-form" onSubmit={(event) => void upload(event)} noValidate>
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
                <Input id="support-document-title" value={title} onChange={(event) => uploadForm.setValue("title", event.target.value)} maxLength={180} autoComplete="off" disabled={uploading} />
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
