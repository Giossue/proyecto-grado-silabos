"use client"

import { Pause, Play } from "lucide-react"
import { useState } from "react"
import { transitionConvocation } from "@/api/convocations"
import type { CoordinationConvocation } from "@/api/dashboard"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { ConvocationOpeningDialog } from "@/components/domain/syllabus/ConvocationOpeningDialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { afterDialogExit, useShownWhileClosing } from "@/lib/dialogExit"
import { SERVER_ERROR, serverMessage, useSchemaForm } from "@/lib/forms"
import { errorMessage } from "@/lib/queryClient"
import { withoutFinalPeriod } from "@/lib/utils"
import { convocationTransitionSchema } from "@/schemas/syllabus"

type Transition = "pausar" | "reanudar"

const DIALOGS: Record<Transition, { title: string; description: string; label: string }> = {
  pausar: {
    title: "Pausar la convocatoria",
    description:
      "Hasta que la reanude, los docentes de su carrera no podrán editar ni enviar, y Coordinación y Biblioteca no podrán revisar sus sílabos. Los borradores se conservan. Durante la pausa puede corregir la malla y los datos curriculares",
    label: "Pausar",
  },
  reanudar: {
    title: "Reanudar la convocatoria",
    description: "Los docentes vuelven a trabajar, los paralelos creados durante la pausa reciben su sílabo y la malla y los datos curriculares de la carrera quedan protegidos de nuevo",
    label: "Reanudar",
  },
}

type ConvocationActionsProps = {
  convocation: CoordinationConvocation
  blockedReason?: string
  onChanged?: (message: string) => void
}

export function ConvocationActions({ convocation, blockedReason, onChanged }: ConvocationActionsProps) {
  const [pending, setPending] = useState<Transition | null>(null)
  const shownPending = useShownWhileClosing(pending)
  const [openingOpen, setOpeningOpen] = useState(false)
  const form = useSchemaForm(convocationTransitionSchema, { values: { transition: pending ?? "" } })
  const { errors, isSubmitting: processing } = form.formState
  const error = serverMessage(errors) ?? null

  const select = (value: Transition): void => {
    form.clearErrors()
    setPending(value)
  }

  const submit = form.handleSubmit(async ({ transition }) => {
    if (!convocation.convocation_id) return
    try {
      const result = await transitionConvocation(convocation.convocation_id, transition as Transition)
      setPending(null)
      onChanged?.(result.message)
    } catch (failure) {
      form.setError(SERVER_ERROR, { type: "server", message: errorMessage(failure, "No se pudo cambiar la convocatoria") })
    }
  })

  const opened = async (message: string): Promise<void> => {
    await afterDialogExit()
    onChanged?.(message)
  }

  const trigger =
    convocation.convocation_id === null && !convocation.can_open && blockedReason ? (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex" tabIndex={0}>
              <Button type="button" disabled>
                <Play data-icon="inline-start" aria-hidden="true" />
                Abrir convocatoria
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{withoutFinalPeriod(blockedReason)}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ) : convocation.convocation_id === null ? (
      <Button type="button" disabled={!convocation.can_open} onClick={() => setOpeningOpen(true)}>
        <Play data-icon="inline-start" aria-hidden="true" />
        Abrir convocatoria
      </Button>
    ) : convocation.state === "abierta" ? (
      <Button type="button" onClick={() => select("pausar")}>
        <Pause data-icon="inline-start" aria-hidden="true" />
        Pausar convocatoria
      </Button>
    ) : convocation.state === "pausada" ? (
      <Button type="button" disabled={!convocation.process_open} onClick={() => select("reanudar")}>
        <Play data-icon="inline-start" aria-hidden="true" />
        Reanudar convocatoria
      </Button>
    ) : null

  return (
    <>
      {trigger}
      {convocation.convocation_id === null ? (
        <ConvocationOpeningDialog
          open={openingOpen}
          onOpenChange={setOpeningOpen}
          processId={convocation.process_id}
          period={convocation.period}
          onOpened={(message) => void opened(message)}
        />
      ) : null}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !processing) setPending(null)
        }}
      >
        <DialogContent>
          {shownPending ? (
            <>
              <DialogHeader>
                <DialogTitle>{DIALOGS[shownPending].title}</DialogTitle>
                <DialogDescription>{DIALOGS[shownPending].description}</DialogDescription>
              </DialogHeader>
              <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)} noValidate>
                {error ? <FeedbackAlert message={error} /> : null}
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={processing}>
                      Cancelar
                    </Button>
                  </DialogClose>
                  <Button type="button" disabled={processing} onClick={() => void submit()}>
                    {processing ? (
                      <Spinner data-icon="inline-start" />
                    ) : shownPending === "pausar" ? (
                      <Pause data-icon="inline-start" aria-hidden="true" />
                    ) : (
                      <Play data-icon="inline-start" aria-hidden="true" />
                    )}
                    {DIALOGS[shownPending].label}
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
