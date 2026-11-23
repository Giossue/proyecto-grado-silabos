"use client"

import { Play } from "lucide-react"
import { useState, type FormEvent } from "react"
import { ApiError } from "@/api/client"
import { createConvocation } from "@/api/convocations"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { useOpened } from "@/composables/useModelOpen"

type ConvocationOpeningDialogProps = {
  open: boolean
  processId: string
  period: string
  onOpenChange: (open: boolean) => void
  onOpened?: (message: string, convocationId: string) => void
}

export function ConvocationOpeningDialog({ open, processId, onOpenChange, onOpened }: ConvocationOpeningDialogProps) {
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  useOpened(open, () => {
    setError(null)
    setWarnings([])
  })

  const submit = async (event?: FormEvent<HTMLFormElement>): Promise<void> => {
    event?.preventDefault()
    setProcessing(true)
    setError(null)
    setWarnings([])
    try {
      const result = await createConvocation(processId)
      onOpenChange(false)
      onOpened?.(result.message, result.convocation_id)
    } catch (reason) {
      if (reason instanceof ApiError) {
        const messages = Object.values(reason.errors).flat()
        setWarnings(messages)
        setError(messages.length > 1 ? "Todavía no puede abrir la convocatoria:" : (messages[0] ?? reason.message))
      } else {
        setError("No se pudo abrir la convocatoria")
      }
    } finally {
      setProcessing(false)
    }
  }

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
        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
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
