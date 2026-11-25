"use client"

import { RotateCcw } from "lucide-react"
import { useState } from "react"
import { ApiError } from "@/api/client"
import { resetSyllabus, type ReviewDetail } from "@/api/reviews"
import { ConfirmPhrase } from "@/components/domain/ConfirmPhrase"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useModelOpen, useOpened } from "@/composables/useModelOpen"
import { applyApiErrors, errorMessages, useSchemaForm } from "@/lib/forms"
import { REASON_MIN, restartSchema } from "@/schemas/syllabus"

type SyllabusRestartDialogProps = {
  syllabusId: string
  subject: string
  impact: ReviewDetail["reset"]
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: (message: string) => void
}

export function SyllabusRestartDialog({ syllabusId, subject, impact, open, onOpenChange, onSaved }: SyllabusRestartDialogProps) {
  const [isOpen, setOpen] = useModelOpen(open, onOpenChange)
  const form = useSchemaForm(restartSchema, { defaultValues: { reason: "" } })
  const reason = String(form.watch("reason") ?? "")
  const errors = form.formState.errors as Record<string, unknown>
  const processing = form.formState.isSubmitting
  const [typedName, setTypedName] = useState("")
  useOpened(isOpen, () => {
    form.reset({ reason: "" })
    setTypedName("")
  })

  const needsName = impact.erases_history === true
  const ready = reason.trim().length >= REASON_MIN && (!needsName || typedName.trim() === subject.trim())
  const losses = ["Lo escrito por el docente"]
  if ((impact.signatures ?? 0) > 0) losses.push(`${impact.signatures} firma(s)`)
  if (impact.erases_history) losses.push(`${impact.revisions ?? 0} revisión(es), la aprobación y el PDF`)

  const submit = async (): Promise<void> => {
    if (!ready) return
    try {
      const result = await resetSyllabus(syllabusId, reason.trim())
      setOpen(false)
      onSaved?.(result.message)
    } catch (failure) {
      if (failure instanceof ApiError) applyApiErrors(form.setError, failure, { fallback: failure.message })
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reiniciar «{subject}»</DialogTitle>
          <DialogDescription>El docente empieza de cero con la malla y la plantilla actuales. Esto se borra:</DialogDescription>
        </DialogHeader>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          {losses.map((item) => (
            <li key={item}>{item}</li>
          ))}
          {!impact.erases_history ? <li className="list-none text-muted-foreground">Las revisiones enviadas se conservan como historial</li> : null}
        </ul>
        <form className="flex flex-col gap-4" noValidate onSubmit={form.handleSubmit(submit)}>
          <Field data-invalid={errors.reason !== undefined}>
            <FieldLabel htmlFor="restart-reason" required>
              Motivo (lo verá el docente)
            </FieldLabel>
            <Textarea id="restart-reason" value={reason} rows={3} maxLength={500} aria-required="true" onChange={(event) => form.setValue("reason", event.target.value)} />
            <FieldError errors={errorMessages(errors.reason)} />
          </Field>
          {needsName ? <ConfirmPhrase id="restart-name" phrase={subject} value={typedName} onValueChange={setTypedName} /> : null}
          <FieldError errors={errorMessages(errors.syllabus)} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={processing || !ready}>
              {processing ? <Spinner data-icon="inline-start" /> : <RotateCcw data-icon="inline-start" aria-hidden="true" />}
              Reiniciar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
