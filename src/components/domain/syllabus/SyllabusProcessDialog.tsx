"use client"

import { CalendarPlus } from "lucide-react"
import { useState, type FormEvent } from "react"
import { ApiError } from "@/api/client"
import { createProcess } from "@/api/processes"
import { DatePicker } from "@/components/DatePicker"
import { ConfirmPhrase } from "@/components/domain/ConfirmPhrase"
import { FormDialogActions } from "@/components/domain/FormDialogActions"
import { FormModal } from "@/components/domain/FormModal"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { useModelOpen, useOpened } from "@/composables/useModelOpen"
import { useInstitutionToday } from "@/composables/useInstitutionDate"
import { matchesPhrase } from "@/lib/confirmPhrase"

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

const OPEN_PHRASE = "abrir convocatoria"

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
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [openingTyped, setOpeningTyped] = useState("")
  const [form, setForm] = useState(() => ({ period_id: period?.id ?? "", starts_at: "", due_at: "" }))
  useOpened(confirmOpen, () => setOpeningTyped(""))
  useOpened(isOpen, () => {
    setForm({ period_id: period?.id ?? "", starts_at: "", due_at: "" })
    setErrors({})
  })

  const todayIso = useInstitutionToday()
  const periodEnd = period?.ends_on?.slice(0, 10)
  const dueMinimum = form.starts_at > todayIso ? form.starts_at : todayIso
  const update = (key: keyof typeof form, value: string): void => setForm((current) => ({ ...current, [key]: value }))

  const askConfirmation = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!disabled) setConfirmOpen(true)
  }

  const submit = async (): Promise<void> => {
    if (disabled) return
    setConfirmOpen(false)
    setProcessing(true)
    setErrors({})
    try {
      const result = await createProcess(form)
      setOpen(false)
      onSaved?.(result.message)
    } catch (reason) {
      setErrors(reason instanceof ApiError ? reason.errors : {})
    } finally {
      setProcessing(false)
    }
  }

  return (
    <FormModal
      open={isOpen}
      onOpenChange={setOpen}
      disabled={disabled}
      triggerLabel={triggerLabel}
      title="Abrir convocatoria institucional"
      description={period ? `Elija las fechas de elaboración del período ${period.codigo}` : "Fechas de inicio y entrega de los sílabos para todas las carreras"}
      showTrigger={display !== "menu"}
    >
      {({ close }) => (
        <>
          <form onSubmit={askConfirmation}>
            <FieldGroup>
              {errors.process ? (
                <Field data-invalid>
                  <FieldError errors={errors.process} />
                </Field>
              ) : null}
              {period ? (
                <Field>
                  <FieldLabel>Periodo académico</FieldLabel>
                  <div className="rounded-md bg-muted/30 px-3 py-2 text-sm ring-1 ring-surface-ring">{period.codigo}</div>
                  <p className="text-sm text-muted-foreground">Se fija desde el período seleccionado y no se vuelve a elegir aquí</p>
                </Field>
              ) : (
                <Field data-invalid={Boolean(errors.period_id)}>
                  <FieldLabel htmlFor="process-period" required>
                    Periodo académico
                  </FieldLabel>
                  <Select value={form.period_id} onValueChange={(value) => update("period_id", value)} required>
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
                  <FieldError errors={errors.period_id} />
                </Field>
              )}
              <Field data-invalid={Boolean(errors.starts_at)}>
                <FieldLabel htmlFor="process-starts" required>
                  Inicio de la elaboración
                </FieldLabel>
                <DatePicker id="process-starts" value={form.starts_at} onValueChange={(value) => update("starts_at", value)} minValue={todayIso} maxValue={periodEnd} required ariaInvalid={Boolean(errors.starts_at)} />
                <p className="text-sm text-muted-foreground">Elija cuándo comienza la elaboración; no se copia el inicio de clases</p>
                <FieldError errors={errors.starts_at} />
              </Field>
              <Field data-invalid={Boolean(errors.due_at)}>
                <FieldLabel htmlFor="process-due" required>
                  Fecha límite de entrega
                </FieldLabel>
                <DatePicker id="process-due" value={form.due_at} onValueChange={(value) => update("due_at", value)} minValue={dueMinimum} maxValue={periodEnd} required ariaInvalid={Boolean(errors.due_at)} />
                <p className="text-sm text-muted-foreground">Esta fecha se heredará en la convocatoria de cada carrera</p>
                <FieldError errors={errors.due_at} />
              </Field>
              <FormDialogActions close={close} processing={processing} icon={CalendarPlus} label="Abrir convocatoria" />
            </FieldGroup>
          </form>
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Abrir convocatoria</DialogTitle>
                <DialogDescription>
                  Una vez abierta, sus fechas no se pueden editar. Cada Coordinación abre después la convocatoria de su carrera y los sílabos parten del proyecto de carrera de cada materia
                </DialogDescription>
              </DialogHeader>
              <ConfirmPhrase id="process-open-confirm" value={openingTyped} onValueChange={setOpeningTyped} phrase={OPEN_PHRASE} />
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
