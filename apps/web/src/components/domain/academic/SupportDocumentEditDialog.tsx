"use client"

import { Save } from "lucide-react"
import { useState } from "react"
import { ApiError } from "@/api/client"
import { updateSupportDocument, type SupportDocument } from "@/api/support-documents"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { FileDropzone } from "@/components/domain/FileDropzone"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useOpened } from "@/composables/useModelOpen"
import { useShownWhileClosing } from "@/lib/dialogExit"
import { SERVER_ERROR, fieldMessage, serverMessage, useSchemaForm } from "@/lib/forms"
import { toast } from "@/lib/toast"
import { supportDocumentEditSchema, SUPPORT_DOCUMENT_TITLE_MAX } from "@silabos/shared/schemas/academic"

type SupportDocumentEditDialogProps = {
  document: SupportDocument | null
  maxBytes: number
  onClose: () => void
  onUpdated: () => void
}

export function SupportDocumentEditDialog({ document, maxBytes, onClose, onUpdated }: SupportDocumentEditDialogProps) {
  const shown = useShownWhileClosing(document)
  const form = useSchemaForm(supportDocumentEditSchema, { defaultValues: { file: null, title: "" } })
  const [dropError, setDropError] = useState<string | null>(null)
  const title = String(form.watch("title") ?? "")
  const file = form.watch("file") ?? null
  const titleError = fieldMessage(form.formState.errors, "title") ?? null
  const fileError = dropError ?? fieldMessage(form.formState.errors, "file") ?? null
  const failure = serverMessage(form.formState.errors) ?? null
  const saving = form.formState.isSubmitting

  useOpened(document !== null, () => {
    setDropError(null)
    form.reset({ file: null, title: document?.title ?? "" })
  })

  const save = form.handleSubmit(async ({ title: name, file: picked }) => {
    if (!document) return
    try {
      await updateSupportDocument(document.id, name, picked)
      onUpdated()
      onClose()
      toast.success("Documento actualizado")
    } catch (reason) {
      form.setError(SERVER_ERROR, { type: "server", message: reason instanceof ApiError ? (Object.values(reason.errors)[0]?.[0] ?? reason.message) : "No se pudo actualizar el documento" })
    }
  })

  return (
    <Dialog
      open={document !== null}
      onOpenChange={(open) => {
        if (!open && !saving) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Actualizar documento</DialogTitle>
          <DialogDescription>Cambie el nombre o suba un archivo nuevo para reemplazar el actual</DialogDescription>
        </DialogHeader>
        <form key={shown?.id} className="flex flex-col gap-4" data-testid="support-document-edit-form" onSubmit={(event) => void save(event)} noValidate>
          <Field data-invalid={Boolean(titleError)}>
            <FieldLabel htmlFor="support-document-edit-title" required>
              Nombre
            </FieldLabel>
            <Input
              id="support-document-edit-title"
              value={title}
              onChange={(event) => {
                form.setValue("title", event.target.value)
                form.clearErrors("title")
              }}
              maxLength={SUPPORT_DOCUMENT_TITLE_MAX}
              aria-invalid={Boolean(titleError)}
              autoComplete="off"
              disabled={saving}
            />
            {titleError ? <FieldError errors={[titleError]} /> : null}
          </Field>
          <Field data-invalid={Boolean(fileError)}>
            <FieldLabel htmlFor="support-document-edit-file">Archivo nuevo (opcional)</FieldLabel>
            <FileDropzone
              value={file}
              onValueChange={(picked) => {
                form.setValue("file", picked)
                setDropError(null)
              }}
              inputId="support-document-edit-file"
              kind="document"
              maxBytes={maxBytes}
              disabled={saving}
              invalid={Boolean(fileError)}
              state={saving ? "uploading" : "idle"}
              onValidationError={setDropError}
            />
            {fileError ? <FieldError errors={[fileError]} /> : null}
          </Field>
          {failure ? <FeedbackAlert message={failure} /> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={saving}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
