"use client"

import { CalendarClock, RefreshCcw } from "lucide-react"
import { useState, type FormEvent } from "react"
import { ApiError } from "@/api/client"
import { extendProcessDeadline, type PendingChangeCounts, type SyllabusProcess, type SyllabusStateCounts } from "@/api/processes"
import { DatePicker } from "@/components/DatePicker"
import { ConfirmPhrase } from "@/components/domain/ConfirmPhrase"
import { FormDialogActions } from "@/components/domain/FormDialogActions"
import { FormModal } from "@/components/domain/FormModal"
import { SyllabusStateCountsTable } from "@/components/domain/syllabus/SyllabusStateCountsTable"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { useModelOpen, useOpened } from "@/composables/useModelOpen"
import { matchesPhrase } from "@/lib/confirmPhrase"
import { formatDateDisplay } from "@/lib/dateDisplay"

const TEMPLATE_PHRASE = "adaptar sílabos"
const PENDING_PHRASE = "aplicar cambios"

type DeadlineExtensionDialogProps = {
  process: SyllabusProcess
  display?: "button" | "menu"
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: (message: string) => void
}

export function DeadlineExtensionDialog({ process, display = "button", open, onOpenChange, onSaved }: DeadlineExtensionDialogProps) {
  const [isOpen, setOpen] = useModelOpen(open, onOpenChange)
  const [processing, setProcessing] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [dueAt, setDueAt] = useState("")
  const [templateImpact, setTemplateImpact] = useState<SyllabusStateCounts | null>(null)
  const [pendingImpact, setPendingImpact] = useState<PendingChangeCounts | null>(null)
  const [typed, setTyped] = useState("")
  useOpened(isOpen, () => {
    setDueAt("")
    setErrors({})
    setTemplateImpact(null)
    setPendingImpact(null)
    setTyped("")
  })

  const finalized = process.state === "cerrado"
  const phrase = templateImpact ? TEMPLATE_PHRASE : PENDING_PHRASE
  const needsPhrase = templateImpact !== null || pendingImpact !== null
  const phraseReady = !needsPhrase || matchesPhrase(typed, phrase)
  const pendingLines = pendingImpact
    ? [
        { label: "Vuelven a borrador, sin su historial ni sus firmas", total: pendingImpact.to_draft },
        { label: "Se rehacen o se quitan, sin su contenido", total: pendingImpact.restarted },
        { label: "Vuelven a Coordinación, sin sus aprobaciones", total: pendingImpact.to_coordination },
      ].filter((line) => line.total > 0)
    : []
  const submitLabel = templateImpact ? "Prorrogar y adaptar sílabos" : pendingImpact ? "Prorrogar y aplicar cambios" : finalized ? "Prorrogar y reabrir" : "Prorrogar entrega"
  const ordinal = `Prórroga ${Math.min(process.extensions_used + 1, process.extensions_max)} de ${process.extensions_max}`
  const limit = formatDateDisplay(process.extension_limit_on, { dateStyle: "medium" })

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!phraseReady) return
    setProcessing(true)
    setErrors({})
    try {
      const result = await extendProcessDeadline(process.id, {
        due_at: dueAt,
        ...(templateImpact ? { confirmar_rehacer: true } : {}),
        ...(pendingImpact ? { confirmar_cambios: true } : {}),
      })
      setOpen(false)
      onSaved?.(result.message)
    } catch (reason) {
      const payload = reason instanceof ApiError ? reason.payload : null
      if (payload?.code === "plantilla_cambiada" || payload?.code === "cambios_pendientes") {
        if (payload.code === "plantilla_cambiada") setTemplateImpact(payload.counts as SyllabusStateCounts)
        const pending = payload.code === "cambios_pendientes" ? payload.counts : payload.pending_counts
        if (pending) setPendingImpact(pending as PendingChangeCounts)
        setTyped("")
        return
      }
      setErrors(reason instanceof ApiError ? reason.errors : {})
    } finally {
      setProcessing(false)
    }
  }

  return (
    <FormModal
      open={isOpen}
      onOpenChange={setOpen}
      triggerLabel="Prorrogar plazo"
      showTrigger={display !== "menu"}
      title="Prorrogar el plazo de entrega"
      description="Mueve la fecha límite de entrega hacia adelante para todas las convocatorias"
      trigger={<Button variant="outline">Prorrogar plazo</Button>}
    >
      {({ close }) => (
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <p className="text-sm font-medium">{ordinal}</p>
            {finalized ? (
              <Alert>
                <RefreshCcw aria-hidden="true" />
                <AlertDescription>Al prorrogar, la convocatoria se vuelve a abrir con la nueva fecha</AlertDescription>
              </Alert>
            ) : null}
            <Field data-invalid={Boolean(errors.due_at)}>
              <FieldLabel htmlFor="extension-due" required>
                Nueva fecha límite de entrega
              </FieldLabel>
              <DatePicker id="extension-due" value={dueAt} onValueChange={setDueAt} required maxValue={process.extension_limit_on} ariaInvalid={Boolean(errors.due_at)} />
              <FieldDescription>Debe ser posterior a la fecha límite vigente</FieldDescription>
              <FieldDescription>Hasta el último día de clases: {limit}</FieldDescription>
              <FieldError errors={[...(errors.due_at ?? []), ...(errors.process ?? [])]} />
            </Field>
            {templateImpact ? (
              <>
                <p className="text-sm">
                  La plantilla cambió después de finalizar la convocatoria. Al reabrirla, los sílabos de este período se adaptan a la plantilla nueva: se conserva lo escrito en los campos que siguen encajando y los enviados o aprobados vuelven a borrador, sin su historial ni sus firmas
                </p>
                <SyllabusStateCountsTable counts={templateImpact} caption="Cantidad de sílabos que se adaptan, por estado" />
              </>
            ) : null}
            {pendingImpact ? (
              <>
                <p className="text-sm">Mientras la convocatoria estuvo finalizada hubo cambios que ahora llegan a sus sílabos. Los demás se ponen al día sin cambiar de estado</p>
                <ul className="flex flex-col gap-1 text-sm">
                  {pendingLines.map((line) => (
                    <li key={line.label} className="flex justify-between gap-4">
                      <span>{line.label}</span>
                      <span className="font-medium tabular-nums">{line.total}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {needsPhrase ? <ConfirmPhrase id="extension-template-confirm" value={typed} onValueChange={setTyped} phrase={phrase} /> : null}
            <FormDialogActions close={close} processing={processing} icon={CalendarClock} label={submitLabel} destructive={needsPhrase} disabled={!phraseReady} />
          </FieldGroup>
        </form>
      )}
    </FormModal>
  )
}
