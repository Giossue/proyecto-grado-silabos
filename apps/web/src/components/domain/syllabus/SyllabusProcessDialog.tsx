"use client"

import { CalendarPlus } from "lucide-react"
import { useState } from "react"
import { createProcess } from "@/api/processes"
import { DatePicker } from "@/components/DatePicker"
import { FormDialogActions } from "@/components/domain/FormDialogActions"
import { FormModal } from "@/components/domain/FormModal"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useModelOpen, useOpened } from "@/composables/useModelOpen"
import { useInstitutionToday } from "@/composables/useInstitutionDate"
import { applyApiErrors, errorMessages, useSchemaForm } from "@/lib/forms"
import { processCreationSchema } from "@silabos/shared/schemas/syllabus"

type AcademicPeriod = { id: string; codigo: string; starts_on?: string; ends_on?: string }

type SyllabusProcessDialogProps = {
  template: string | null
  periods: { id: string; codigo: string }[]
  period?: AcademicPeriod | null
  triggerLabel?: string
  display?: "button" | "menu"
  disabled?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: (message: string) => void
}

const schema = processCreationSchema()

export function SyllabusProcessDialog({
  periods,
  period = null,
  triggerLabel = "Nuevo proceso",
  display = "button",
  disabled = false,
  open,
  onOpenChange,
  onSaved,
}: SyllabusProcessDialogProps) {
  const [isOpen, setOpen] = useModelOpen(open, onOpenChange)
  const [processing, setProcessing] = useState(false)
  const blank = () => ({ period_id: period?.id ?? "", starts_at: "", due_at: "" })
  const form = useSchemaForm(schema, { defaultValues: blank() })
  const { errors } = form.formState
  const values = { period_id: String(form.watch("period_id") ?? ""), starts_at: String(form.watch("starts_at") ?? ""), due_at: String(form.watch("due_at") ?? "") }
  const processErrors = errorMessages((errors as Record<string, unknown>).process)
  const periodErrors = errorMessages(errors.period_id)
  const startsErrors = errorMessages(errors.starts_at)
  const dueErrors = errorMessages(errors.due_at)
  useOpened(isOpen, () => form.reset(blank()))

  const todayIso = useInstitutionToday()
  const periodEnd = period?.ends_on?.slice(0, 10)
  const dueMinimum = values.starts_at > todayIso ? values.starts_at : todayIso
  const update = (key: "period_id" | "starts_at" | "due_at", value: string): void => form.setValue(key, value)

  const submit = form.handleSubmit(async (): Promise<void> => {
    if (disabled) return
    setProcessing(true)
    form.clearErrors()
    try {
      const result = await createProcess(form.getValues() as { period_id: string; starts_at: string; due_at: string })
      setOpen(false)
      onSaved?.(result.message)
    } catch (reason) {
      applyApiErrors(form.setError, reason, { fallback: "No se pudo abrir el proceso de sílabos" })
    } finally {
      setProcessing(false)
    }
  })

  return (
    <FormModal
      open={isOpen}
      onOpenChange={setOpen}
      disabled={disabled}
      triggerLabel={triggerLabel}
      title="Abrir proceso de sílabos"
      description={period ? `Elija las fechas de elaboración del período ${period.codigo}` : "Fechas de inicio y entrega de los sílabos para todas las carreras"}
      showTrigger={display !== "menu"}
    >
      {({ close }) => (
        <form onSubmit={(event) => void submit(event)} noValidate>
          <FieldGroup>
            {processErrors ? (
              <Field data-invalid>
                <FieldError errors={processErrors} />
              </Field>
            ) : null}
            {period ? (
              <Field data-invalid={Boolean(periodErrors)}>
                <FieldLabel>Periodo académico</FieldLabel>
                <div className="rounded-md bg-muted/30 px-3 py-2 text-sm ring-1 ring-surface-ring">{period.codigo}</div>
                <p className="text-sm text-muted-foreground">Se fija desde el período seleccionado y no se vuelve a elegir aquí</p>
                <FieldError errors={periodErrors} />
              </Field>
            ) : (
              <Field data-invalid={Boolean(periodErrors)}>
                <FieldLabel htmlFor="process-period" required>
                  Proceso de sílabos
                </FieldLabel>
                <Select value={values.period_id} onValueChange={(value) => update("period_id", value)} required>
                  <SelectTrigger id="process-period" aria-required="true">
                    <SelectValue placeholder="Seleccione un periodo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {periods.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.codigo}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldError errors={periodErrors} />
              </Field>
            )}
            <Field data-invalid={Boolean(startsErrors)}>
              <FieldLabel htmlFor="process-starts" required>
                Inicio de la elaboración
              </FieldLabel>
              <DatePicker id="process-starts" value={values.starts_at} onValueChange={(value) => update("starts_at", value)} minValue={todayIso} maxValue={periodEnd} required ariaInvalid={Boolean(startsErrors)} />
              <p className="text-sm text-muted-foreground">Elija cuándo comienza la elaboración; no se copia el inicio de clases</p>
              <FieldError errors={startsErrors} />
            </Field>
            <Field data-invalid={Boolean(dueErrors)}>
              <FieldLabel htmlFor="process-due" required>
                Fecha límite de entrega
              </FieldLabel>
              <DatePicker id="process-due" value={values.due_at} onValueChange={(value) => update("due_at", value)} minValue={dueMinimum} maxValue={periodEnd} required ariaInvalid={Boolean(dueErrors)} />
              <p className="text-sm text-muted-foreground">Esta fecha se heredará en el proceso de sílabos de cada carrera</p>
              <FieldError errors={dueErrors} />
            </Field>
            <p className="text-sm text-muted-foreground">Una vez abierto, sus fechas no se pueden editar</p>
            <FormDialogActions close={close} processing={processing} icon={CalendarPlus} label="Abrir proceso de sílabos" />
          </FieldGroup>
        </form>
      )}
    </FormModal>
  )
}
