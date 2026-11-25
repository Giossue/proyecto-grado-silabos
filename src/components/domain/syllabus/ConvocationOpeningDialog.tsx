"use client"

import { Play } from "lucide-react"
import { ApiError } from "@/api/client"
import { createConvocation } from "@/api/convocations"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { useOpened } from "@/composables/useModelOpen"
import { SERVER_ERROR, serverMessage, useSchemaForm } from "@/lib/forms"
import { convocationSchema } from "@/schemas/syllabus"

const schema = convocationSchema()

type ConvocationOpeningDialogProps = {
  open: boolean
  processId: string
  period: string
  onOpenChange: (open: boolean) => void
  onOpened?: (message: string, convocationId: string) => void
}

export function ConvocationOpeningDialog({ open, processId, onOpenChange, onOpened }: ConvocationOpeningDialogProps) {
  const form = useSchemaForm(schema, { values: { process_id: processId } })
  const { errors, isSubmitting: processing } = form.formState
  const error = serverMessage(errors) ?? null
  const serverTypes = (errors.root as Record<string, { types?: Record<string, unknown> } | undefined> | undefined)?.server?.types ?? {}
  const warnings = Object.values(serverTypes).map(String)
  useOpened(open, () => form.clearErrors())

  const submit = form.handleSubmit(
    async ({ process_id }) => {
      try {
        const result = await createConvocation(String(process_id))
        onOpenChange(false)
        onOpened?.(result.message, result.convocation_id)
      } catch (reason) {
        const messages = reason instanceof ApiError ? Object.values(reason.errors).flat() : []
        const message = reason instanceof ApiError ? (messages.length > 1 ? "Todavía no puede abrir la convocatoria:" : (messages[0] ?? reason.message)) : "No se pudo abrir la convocatoria"
        form.setError(SERVER_ERROR, { type: "server", message, types: Object.fromEntries(messages.map((text, index) => [`server${index}`, text])) })
      }
    },
    (invalid) => form.setError(SERVER_ERROR, { type: "client", message: invalid.process_id?.message ?? "No se pudo abrir la convocatoria" }),
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!processing) onOpenChange(value)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Abrir convocatoria de la carrera</DialogTitle>
          <DialogDescription>Los docentes podrán elaborar sus sílabos hasta la fecha de entrega</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)} noValidate>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>
                <p>{error}</p>
                {warnings.length > 1 ? (
                  <ul className="list-disc pl-5">
                    {warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={processing}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={processing}>
              {processing ? <Spinner data-icon="inline-start" /> : <Play data-icon="inline-start" aria-hidden="true" />}
              Abrir convocatoria
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
