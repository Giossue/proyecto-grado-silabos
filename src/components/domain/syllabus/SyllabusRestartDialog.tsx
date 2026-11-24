"use client"

import { RotateCcw } from "lucide-react"
import { useState, type FormEvent } from "react"
import { ApiError } from "@/api/client"
import { resetSyllabus, type ReviewDetail } from "@/api/reviews"
import { ConfirmPhrase } from "@/components/domain/ConfirmPhrase"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useModelOpen, useOpened } from "@/composables/useModelOpen"

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
  const [reason, setReason] = useState("")
  const [typedName, setTypedName] = useState("")
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [processing, setProcessing] = useState(false)
  useOpened(isOpen, () => {
    setReason("")
    setTypedName("")
    setErrors({})
  })

  const needsName = impact.erases_history === true
  const ready = reason.trim().length >= 5 && (!needsName || typedName.trim() === subject.trim())
  const losses = ["Lo escrito por el docente"]
  if ((impact.signatures ?? 0) > 0) losses.push(`${impact.signatures} firma(s)`)
  if (impact.erases_history) losses.push(`${impact.revisions ?? 0} revisión(es), la aprobación y el PDF`)

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!ready) return
    setProcessing(true)
    setErrors({})
    try {
      const result = await resetSyllabus(syllabusId, reason.trim())
      setOpen(false)
      onSaved?.(result.message)
    } catch (failure) {
      if (failure instanceof ApiError) setErrors(failure.errors)
    } finally {
      setProcessing(false)
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
        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          <Field data-invalid={Boolean(errors.reason)}>
            <FieldLabel htmlFor="restart-reason" required>
              Motivo (lo verá el docente)
            </FieldLabel>
            <Textarea id="restart-reason" value={reason} rows={3} maxLength={500} aria-required="true" onChange={(event) => setReason(event.target.value)} />
            <FieldError errors={errors.reason} />
          </Field>
          {needsName ? <ConfirmPhrase id="restart-name" phrase={subject} value={typedName} onValueChange={setTypedName} /> : null}
          <FieldError errors={errors.syllabus} />
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
