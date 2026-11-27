"use client"

import { CalendarClock, RefreshCcw } from "lucide-react"
import { ApiError } from "@/api/client"
import { extendProcessDeadline, type DeadlineExtensionPayload, type SyllabusProcess } from "@/api/processes"
import { DatePicker } from "@/components/DatePicker"
import { FormDialogActions } from "@/components/domain/FormDialogActions"
import { FormModal } from "@/components/domain/FormModal"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { useModelOpen, useOpened } from "@/composables/useModelOpen"
import { formatDateDisplay } from "@/lib/dateDisplay"
import { applyApiErrors, errorMessages, useSchemaForm } from "@/lib/forms"
import { deadlineExtensionSchema } from "@silabos/shared/schemas/syllabus"

type DeadlineExtensionDialogProps = {
  process: SyllabusProcess
  display?: "button" | "menu"
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: (message: string) => void
}

const confirmationsFor = (reason: unknown): Partial<DeadlineExtensionPayload> | null => {
  const payload = reason instanceof ApiError ? reason.payload : null
  if (payload?.code === "plantilla_cambiada") return { confirmar_rehacer: true, ...(payload.pending_counts ? { confirmar_cambios: true } : {}) }
  if (payload?.code === "cambios_pendientes") return { confirmar_cambios: true }
  return null
}

const MAX_CONFIRMATION_ROUNDS = 2

export function DeadlineExtensionDialog({ process, display = "button", open, onOpenChange, onSaved }: DeadlineExtensionDialogProps) {
  const [isOpen, setOpen] = useModelOpen(open, onOpenChange)
  const form = useSchemaForm(deadlineExtensionSchema, { defaultValues: { due_at: "" } })
  const processing = form.formState.isSubmitting
  const errors = form.formState.errors as Record<string, unknown>
  const dueAt = String(form.watch("due_at") ?? "")
  const dueErrors = [...(errorMessages(errors.due_at) ?? []), ...(errorMessages(errors.process) ?? [])]
  useOpened(isOpen, () => form.reset({ due_at: "" }))

  const finalized = process.state === "cerrado"
  const submitLabel = finalized ? "Prorrogar y reabrir" : "Prorrogar entrega"
  const ordinal = `Prórroga ${Math.min(process.extensions_used + 1, process.extensions_max)} de ${process.extensions_max}`
  const limit = formatDateDisplay(process.extension_limit_on, { dateStyle: "medium" })

  const extend = async (payload: DeadlineExtensionPayload, round = 0): Promise<{ message: string }> => {
    try {
      return await extendProcessDeadline(process.id, payload)
    } catch (reason) {
      const confirmations = confirmationsFor(reason)
      if (!confirmations || round >= MAX_CONFIRMATION_ROUNDS) throw reason
      return extend({ ...payload, ...confirmations }, round + 1)
    }
  }

  const submit = async (): Promise<void> => {
    try {
      const result = await extend({ due_at: dueAt })
      setOpen(false)
      onSaved?.(result.message)
    } catch (reason) {
      if (reason instanceof ApiError) applyApiErrors(form.setError, reason, { fallback: reason.message })
    }
  }

  return (
    <FormModal
      open={isOpen}
      onOpenChange={setOpen}
      triggerLabel="Prorrogar plazo"
      showTrigger={display !== "menu"}
      title="Prorrogar el plazo de entrega"
      description="Mueve la fecha límite de entrega hacia adelante para todos los procesos de sílabos"
      trigger={<Button variant="outline">Prorrogar plazo</Button>}
    >
      {({ close }) => (
        <form noValidate onSubmit={form.handleSubmit(submit)}>
          <FieldGroup>
            <p className="text-sm font-medium">{ordinal}</p>
            {finalized ? (
              <Alert>
                <RefreshCcw aria-hidden="true" />
                <AlertDescription>Al prorrogar, el proceso de sílabos se vuelve a abrir con la nueva fecha y sus sílabos reciben los cambios pendientes</AlertDescription>
              </Alert>
            ) : null}
            <Field data-invalid={errors.due_at !== undefined}>
              <FieldLabel htmlFor="extension-due" required>
                Nueva fecha límite de entrega
              </FieldLabel>
              <DatePicker id="extension-due" value={dueAt} onValueChange={(value) => form.setValue("due_at", value)} required maxValue={process.extension_limit_on} ariaInvalid={errors.due_at !== undefined} />
              <FieldDescription>Debe ser posterior a la fecha límite vigente</FieldDescription>
              <FieldDescription>Hasta el último día de clases: {limit}</FieldDescription>
              <FieldError errors={dueErrors} />
            </Field>
            <FormDialogActions close={close} processing={processing} icon={CalendarClock} label={submitLabel} />
          </FieldGroup>
        </form>
      )}
    </FormModal>
  )
}
