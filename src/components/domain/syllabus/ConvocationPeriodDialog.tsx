"use client"

import { ArrowLeft, ArrowRight, CalendarPlus } from "lucide-react"
import { useState, type FormEvent } from "react"
import { createAcademicRecord } from "@/api/academic"
import { createProcess } from "@/api/processes"
import { DatePicker } from "@/components/DatePicker"
import { ConfirmPhrase } from "@/components/domain/ConfirmPhrase"
import { FormDialogFooter } from "@/components/domain/FormDialogActions"
import { FormModal } from "@/components/domain/FormModal"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { useFormSteps } from "@/composables/useFormSteps"
import { useModelOpen, useOpened } from "@/composables/useModelOpen"
import { useInstitutionToday } from "@/composables/useInstitutionDate"
import { matchesPhrase } from "@/lib/confirmPhrase"
import { applyApiErrors, errorMessages, useSchemaForm } from "@/lib/forms"
import { periodSchema } from "@/schemas/academic"
import { processCreationSchema } from "@/schemas/syllabus"

type ConvocationPeriodDialogProps = {
  disabled?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: (message: string) => void
}

type Form = { starts_on: string; ends_on: string; starts_at: string; due_at: string }

const EMPTY_FORM: Form = { starts_on: "", ends_on: "", starts_at: "", due_at: "" }
const PERIOD_FIELDS = ["starts_on", "ends_on"] as const
const schema = periodSchema({ startsOn: null, creating: true })
  .pick({ starts_on: true, ends_on: true })
  .extend(processCreationSchema().pick({ starts_at: true, due_at: true }).shape)
const OPEN_PHRASE = "abrir convocatoria"

const monday = (iso: string): number => {
  const date = new Date(`${iso}T00:00:00Z`)
  return date.getTime() - ((date.getUTCDay() + 6) % 7) * 86_400_000
}

export function ConvocationPeriodDialog({ disabled = false, open, onOpenChange, onSaved }: ConvocationPeriodDialogProps) {
  const [isOpen, setOpen] = useModelOpen(open, onOpenChange)
  const [processing, setProcessing] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [openingTyped, setOpeningTyped] = useState("")
  const schemaForm = useSchemaForm(schema, { defaultValues: EMPTY_FORM })
  const watched = schemaForm.watch()
  const form: Form = { starts_on: String(watched.starts_on ?? ""), ends_on: String(watched.ends_on ?? ""), starts_at: String(watched.starts_at ?? ""), due_at: String(watched.due_at ?? "") }
  const formErrors = schemaForm.formState.errors
  const errors: Partial<Record<keyof Form | "process", string[]>> = {
    process: errorMessages((formErrors as Record<string, unknown>).process),
    starts_on: errorMessages(formErrors.starts_on),
    ends_on: errorMessages(formErrors.ends_on),
    starts_at: errorMessages(formErrors.starts_at),
    due_at: errorMessages(formErrors.due_at),
  }
  const [createdPeriodId, setCreatedPeriodId] = useState<string | null>(null)
  const { step, goTo, reset: resetStep, stepClassName } = useFormSteps<1 | 2>(1)
  useOpened(confirmOpen, () => setOpeningTyped(""))
  useOpened(isOpen, () => {
    schemaForm.reset(EMPTY_FORM)
    setCreatedPeriodId(null)
    setConfirmOpen(false)
    resetStep()
  })

  const todayIso = useInstitutionToday()
  const periodEndMinimum = form.starts_on || todayIso
  const dueMinimum = form.starts_at > todayIso ? form.starts_at : todayIso
  const periodEnd = form.ends_on || undefined
  const periodComplete = Boolean(form.starts_on && form.ends_on)
  const calendarWeeks = periodComplete ? Math.round((monday(form.ends_on) - monday(form.starts_on)) / 604_800_000) + 1 : null
  const processComplete = Boolean(form.starts_at && form.due_at)
  const periodCreated = createdPeriodId !== null

  const update = (key: keyof Form, value: string): void => {
    schemaForm.setValue(key, value)
    if (key === "starts_on" && value && form.ends_on && form.ends_on < value) schemaForm.setValue("ends_on", "")
  }

  const confirmOrReturn = schemaForm.handleSubmit(
    () => {
      if (!disabled) setConfirmOpen(true)
    },
    (invalid) => {
      if (PERIOD_FIELDS.some((key) => invalid[key])) goTo(1)
    },
  )

  const askConfirmation = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (step === 1) {
      if (periodComplete) goTo(2)
      return
    }
    if (processComplete) void confirmOrReturn(event)
  }

  const submit = async (): Promise<void> => {
    if (disabled) return
    setConfirmOpen(false)
    setProcessing(true)
    schemaForm.clearErrors()
    try {
      let periodId = createdPeriodId
      let message = "Periodo académico creado"
      if (!periodId) {
        const period = await createAcademicRecord("periodo", { starts_on: form.starts_on, ends_on: form.ends_on })
        periodId = period.id ?? null
        message = period.message
        setCreatedPeriodId(periodId)
      }
      if (periodId) {
        const process = await createProcess({ period_id: periodId, starts_at: form.starts_at, due_at: form.due_at })
        message = process.message
      }
      setOpen(false)
      onSaved?.(message)
    } catch (reason) {
      const next = applyApiErrors(schemaForm.setError, reason, { fallback: "No se pudo abrir la convocatoria" })
      if (next.starts_on || next.ends_on) goTo(1)
    } finally {
      setProcessing(false)
    }
  }

  const description = (fallback: string): string => (periodCreated ? "El periodo ya quedó creado; solo falta abrir la convocatoria" : fallback)

  return (
    <FormModal open={isOpen} onOpenChange={setOpen} disabled={disabled} triggerLabel="Nueva convocatoria" title="Nueva convocatoria" description="Primero el periodo lectivo y después las fechas de los sílabos">
      {({ close }) => (
        <>
          <form onSubmit={askConfirmation} noValidate>
            <FieldGroup>
              {errors.process ? (
                <Field data-invalid>
                  <FieldError errors={errors.process} />
                </Field>
              ) : null}
              <div className="relative overflow-hidden">
                {step === 1 ? (
                  <FieldSet key="period" className={stepClassName}>
                    <FieldLegend>Periodo lectivo</FieldLegend>
                    <FieldDescription>{description("Fechas de inicio y fin de clases; la etiqueta se genera con el rango de meses y año")}</FieldDescription>
                    <div className="grid grid-cols-2 items-start gap-4">
                      <Field data-invalid={Boolean(errors.starts_on)}>
                        <FieldLabel htmlFor="convocation-period-starts" required>
                          Inicio de clases
                        </FieldLabel>
                        <DatePicker id="convocation-period-starts" value={form.starts_on} onValueChange={(value) => update("starts_on", value)} disabled={periodCreated} required ariaInvalid={Boolean(errors.starts_on)} />
                        <FieldError errors={errors.starts_on} />
                      </Field>
                      <Field data-invalid={Boolean(errors.ends_on)}>
                        <FieldLabel htmlFor="convocation-period-ends" required>
                          Fin de clases
                        </FieldLabel>
                        <DatePicker id="convocation-period-ends" value={form.ends_on} onValueChange={(value) => update("ends_on", value)} minValue={periodEndMinimum} disabled={periodCreated} required ariaInvalid={Boolean(errors.ends_on)} />
                        <FieldError errors={errors.ends_on} />
                      </Field>
                    </div>
                    {calendarWeeks ? (
                      <p className="text-sm text-muted-foreground">
                        Serían {calendarWeeks} {calendarWeeks === 1 ? "semana" : "semanas"} de clase entre las fechas
                      </p>
                    ) : null}
                  </FieldSet>
                ) : (
                  <FieldSet key="syllabus" className={stepClassName}>
                    <FieldLegend>Elaboración de sílabos</FieldLegend>
                    <FieldDescription>{description("Elija cuándo empieza la elaboración y hasta cuándo se entrega")}</FieldDescription>
                    <div className="grid grid-cols-2 items-start gap-4">
                      <Field data-invalid={Boolean(errors.starts_at)}>
                        <FieldLabel htmlFor="convocation-starts" required>
                          Inicio de la elaboración
                        </FieldLabel>
                        <DatePicker id="convocation-starts" value={form.starts_at} onValueChange={(value) => update("starts_at", value)} minValue={todayIso} maxValue={periodEnd} required ariaInvalid={Boolean(errors.starts_at)} />
                        <FieldError errors={errors.starts_at} />
                      </Field>
                      <Field data-invalid={Boolean(errors.due_at)}>
                        <FieldLabel htmlFor="convocation-due" required>
                          Fecha límite de entrega
                        </FieldLabel>
                        <DatePicker id="convocation-due" value={form.due_at} onValueChange={(value) => update("due_at", value)} minValue={dueMinimum} maxValue={periodEnd} required ariaInvalid={Boolean(errors.due_at)} />
                        <FieldError errors={errors.due_at} />
                      </Field>
                    </div>
                  </FieldSet>
                )}
              </div>
              <FormDialogFooter>
                {step === 1 ? (
                  <Button type="button" variant="outline" onClick={close}>
                    Cancelar
                  </Button>
                ) : (
                  <Button type="button" variant="outline" onClick={() => goTo(1)}>
                    <ArrowLeft data-icon="inline-start" aria-hidden="true" />
                    Atrás
                  </Button>
                )}
                {step === 1 ? (
                  <Button type="submit" disabled={!periodComplete}>
                    Siguiente
                    <ArrowRight data-icon="inline-end" aria-hidden="true" />
                  </Button>
                ) : (
                  <Button type="submit" disabled={processing || disabled || !processComplete}>
                    {processing ? <Spinner data-icon="inline-start" /> : <CalendarPlus data-icon="inline-start" aria-hidden="true" />}
                    Abrir convocatoria
                  </Button>
                )}
              </FormDialogFooter>
            </FieldGroup>
          </form>
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Abrir convocatoria</DialogTitle>
                <DialogDescription>Al abrirla:</DialogDescription>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
                  <li>El periodo y sus fechas ya no se pueden editar</li>
                  <li>Cada Coordinación abre después la convocatoria de su carrera</li>
                  <li>Los sílabos parten del proyecto de carrera de cada materia</li>
                </ul>
              </DialogHeader>
              <ConfirmPhrase id="convocation-open-confirm" value={openingTyped} onValueChange={setOpeningTyped} phrase={OPEN_PHRASE} />
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancelar
                  </Button>
                </DialogClose>
                <Button type="button" disabled={processing || !matchesPhrase(openingTyped, OPEN_PHRASE)} onClick={() => void submit()}>
                  {processing ? <Spinner data-icon="inline-start" /> : <CalendarPlus data-icon="inline-start" aria-hidden="true" />}
                  Abrir convocatoria
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </FormModal>
  )
}
