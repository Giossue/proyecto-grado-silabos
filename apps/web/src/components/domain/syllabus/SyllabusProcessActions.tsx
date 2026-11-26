"use client"

import { CalendarClock, Lock, Pause, Play, Trash2, type LucideIcon } from "lucide-react"
import { useImperativeHandle, useState, type FormEvent, type ReactNode, type Ref } from "react"
import { ApiError } from "@/api/client"
import { deleteProcess, getProcessImpact, transitionProcess, type ProcessImpact, type SyllabusProcess, type SyllabusStateCounts } from "@/api/processes"
import { ConfirmPhrase } from "@/components/domain/ConfirmPhrase"
import { TableActionsMenu } from "@/components/domain/TableActionsMenu"
import { DeadlineExtensionDialog } from "@/components/domain/syllabus/DeadlineExtensionDialog"
import { SyllabusStateCountsTable } from "@/components/domain/syllabus/SyllabusStateCountsTable"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { matchesPhrase } from "@/lib/confirmPhrase"
import { afterDialogExit, useShownWhileClosing } from "@/lib/dialogExit"
import { withoutFinalPeriod } from "@/lib/utils"

type Transition = "pausar" | "reanudar" | "cerrar"

export type ProcessActionKey = Transition | "prorrogar" | "eliminar"

export type SyllabusProcessActionsHandle = { run: (key: ProcessActionKey) => void }

const DIALOGS: Record<Transition, { title: string; description: string; label: string; icon: LucideIcon; destructive?: boolean }> = {
  pausar: {
    title: "Pausar el periodo académico",
    description: "Se detienen los envíos y la edición docente en todas las carreras hasta que lo reanude",
    label: "Pausar",
    icon: Pause,
  },
  reanudar: {
    title: "Reanudar el periodo académico",
    description: "Los envíos vuelven a admitirse y la plantilla vuelve a quedar protegida",
    label: "Reanudar",
    icon: Play,
  },
  cerrar: {
    title: "Finalizar el periodo académico",
    description:
      "Los sílabos del período quedan guardados solo para consulta: ya no se editan, envían, revisan ni firman, y un cambio de docente no los borra. Puede volver a abrirlo con una prórroga mientras no hayan terminado las clases",
    label: "Finalizar",
    icon: Lock,
    destructive: true,
  },
}

const DELETE_PHRASE = "eliminar periodo"

type SyllabusProcessActionsProps = {
  process: SyllabusProcess
  menu?: boolean
  onCompleted?: (message: string) => void
  children?: ReactNode
  ref?: Ref<SyllabusProcessActionsHandle>
}

export function SyllabusProcessActions({ process, menu = true, onCompleted, children, ref }: SyllabusProcessActionsProps) {
  const [pending, setPending] = useState<Transition | null>(null)
  const shownPending = useShownWhileClosing(pending)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [templateImpact, setTemplateImpact] = useState<SyllabusStateCounts | null>(null)
  const [deadlineOpen, setDeadlineOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string[]>>({})
  const [deleteMessage, setDeleteMessage] = useState("")
  const [deleteTyped, setDeleteTyped] = useState("")
  const [impact, setImpact] = useState<ProcessImpact | null>(null)
  const [impactLoading, setImpactLoading] = useState(false)
  const [impactError, setImpactError] = useState<string | null>(null)
  const [typed, setTyped] = useState("")

  const phrase = shownPending === "cerrar" ? "finalizar periodo" : shownPending === "reanudar" && templateImpact ? "adaptar sílabos" : null
  const [phraseSeen, setPhraseSeen] = useState(phrase)
  if (phraseSeen !== phrase) {
    setPhraseSeen(phrase)
    setTyped("")
  }
  const phraseReady = phrase === null || matchesPhrase(typed, phrase)
  const transitionReady = phraseReady && (shownPending !== "cerrar" || impact !== null)
  const unapproved: SyllabusStateCounts = Object.fromEntries(Object.entries(impact?.syllabi ?? {}).filter(([state, count]) => state !== "aprobado" && count > 0))
  const unapprovedTotal = Object.values(unapproved).reduce((sum, count) => sum + count, 0)
  const deleteReady = !deleting && impact !== null && deleteMessage.trim() !== "" && matchesPhrase(deleteTyped, DELETE_PHRASE)

  const loadImpact = async (failure: string): Promise<void> => {
    setImpact(null)
    setImpactLoading(true)
    setImpactError(null)
    try {
      setImpact(await getProcessImpact(process.id))
    } catch {
      setImpactError(failure)
    } finally {
      setImpactLoading(false)
    }
  }

  const begin = (transition: Transition): void => {
    setPending(transition)
    setTemplateImpact(null)
    setError(null)
    setTyped("")
    if (transition === "cerrar") void loadImpact("No se pudo saber cuántos sílabos quedan sin aprobar. Inténtelo de nuevo")
  }

  const startDelete = (): void => {
    setDeleteError(null)
    setDeleteOpen(true)
    setDeleteTyped("")
    setDeleteMessage("")
    setDeleteErrors({})
    void loadImpact("No se pudo saber cuántos sílabos se borran. Inténtelo de nuevo")
  }

  const confirm = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!pending || !transitionReady) return
    setProcessing(true)
    setError(null)
    try {
      const response = await transitionProcess(process.id, pending, templateImpact ? { confirmar_rehacer: true } : undefined)
      setPending(null)
      onCompleted?.(response.message)
    } catch (cause) {
      if (cause instanceof ApiError && cause.payload.code === "plantilla_cambiada" && pending === "reanudar") {
        const counts = cause.payload.counts
        if (counts && typeof counts === "object") setTemplateImpact(counts as SyllabusStateCounts)
        return
      }
      setError(cause instanceof ApiError ? cause.message : "No se pudo cambiar el estado del proceso")
    } finally {
      setProcessing(false)
    }
  }

  const openDelete = (event: Event): void => {
    event.preventDefault()
    startDelete()
  }

  const extended = async (message: string): Promise<void> => {
    await afterDialogExit()
    onCompleted?.(message)
  }

  const run = (key: ProcessActionKey): void => {
    if (key === "prorrogar") setDeadlineOpen(true)
    else if (key === "eliminar") startDelete()
    else begin(key)
  }
  useImperativeHandle(ref, () => ({ run }))

  const remove = async (): Promise<void> => {
    if (!deleteReady) return
    setDeleting(true)
    setDeleteError(null)
    setDeleteErrors({})
    try {
      const response = await deleteProcess(process.id, { mensaje: deleteMessage.trim() })
      setDeleteOpen(false)
      await afterDialogExit()
      onCompleted?.(response.message)
    } catch (cause) {
      if (cause instanceof ApiError && cause.errors.mensaje) {
        setDeleteErrors(cause.errors)
        return
      }
      setDeleteError(cause instanceof ApiError ? (cause.errors.process?.[0] ?? cause.message) : "No se pudo eliminar el periodo académico")
    } finally {
      setDeleting(false)
    }
  }

  const shown = shownPending ? DIALOGS[shownPending] : null
  const ShownIcon = shown?.icon

  return (
    <>
      {menu ? (
        <TableActionsMenu label={`Acciones para ${process.name}`}>
          {children}
          {process.state === "abierto" ? (
            <DropdownMenuItem onSelect={() => begin("pausar")}>
              <Pause />
              Pausar
            </DropdownMenuItem>
          ) : null}
          {process.state === "pausado" ? (
            <DropdownMenuItem onSelect={() => begin("reanudar")}>
              <Play />
              Reanudar
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem disabled={Boolean(process.extension_block_reason)} onSelect={() => setDeadlineOpen(true)}>
            <CalendarClock />
            <span className="flex flex-col">
              Prorrogar plazo
              {process.extension_block_reason ? <span className="text-xs text-muted-foreground">{withoutFinalPeriod(process.extension_block_reason)}</span> : null}
            </span>
          </DropdownMenuItem>
          {process.state !== "cerrado" ? <DropdownMenuSeparator /> : null}
          {process.state === "abierto" || process.state === "pausado" ? (
            <DropdownMenuItem variant="destructive" onSelect={() => begin("cerrar")}>
              <Lock />
              Finalizar
            </DropdownMenuItem>
          ) : null}
          {process.deletable && process.state !== "cerrado" ? (
            <DropdownMenuItem variant="destructive" onSelect={openDelete}>
              <Trash2 aria-hidden="true" />
              Eliminar
            </DropdownMenuItem>
          ) : null}
        </TableActionsMenu>
      ) : null}

      <Dialog
        open={pending !== null}
        onOpenChange={(value) => {
          if (!value) setPending(null)
        }}
      >
        <DialogContent>
          {shownPending && shown && ShownIcon ? (
            <>
              <DialogHeader>
                <DialogTitle>{shown.title}</DialogTitle>
                <DialogDescription>{shown.description}</DialogDescription>
              </DialogHeader>
              <form className="flex flex-col gap-4" onSubmit={(event) => void confirm(event)}>
                {templateImpact ? (
                  <>
                    <p>
                      El administrador cambió la plantilla durante la pausa. Al reanudar, los sílabos de este período se adaptan a la plantilla nueva: se conserva lo escrito en los campos que siguen encajando y los enviados o aprobados vuelven a borrador, sin su historial ni sus firmas
                    </p>
                    <SyllabusStateCountsTable counts={templateImpact} caption="Cantidad de sílabos que se adaptan, por estado" />
                  </>
                ) : null}
                {shownPending === "cerrar" ? (
                  impactLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : impactError ? (
                    <Alert variant="destructive">
                      <AlertDescription>{impactError}</AlertDescription>
                    </Alert>
                  ) : impact ? (
                    impact.total === 0 ? (
                      <p>El periodo académico no tiene sílabos</p>
                    ) : unapprovedTotal === 0 ? (
                      <p>Todos los sílabos están aprobados</p>
                    ) : (
                      <>
                        <p>Lo que no esté aprobado quedará solo para consulta</p>
                        <SyllabusStateCountsTable counts={unapproved} total={unapprovedTotal} caption="Sílabos sin aprobar, por estado" />
                      </>
                    )
                  ) : null
                ) : null}
                {phrase ? <ConfirmPhrase id="process-transition-confirm" value={typed} onValueChange={setTyped} phrase={phrase} /> : null}
                {error ? (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">
                      Cancelar
                    </Button>
                  </DialogClose>
                  <Button type="submit" variant={templateImpact || shown.destructive ? "destructive" : "default"} disabled={processing || !transitionReady}>
                    {processing ? <Spinner data-icon="inline-start" /> : <ShownIcon data-icon="inline-start" aria-hidden="true" />}
                    {templateImpact ? "Reanudar y adaptar sílabos" : shown.label}
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar periodo académico</DialogTitle>
            <DialogDescription>
              Se borran el periodo académico, los de cada carrera y todos sus sílabos, incluso los enviados y aprobados. El período queda libre para abrir otro periodo académico. Esta acción no se puede deshacer
            </DialogDescription>
          </DialogHeader>
          {impactLoading ? (
            <Skeleton className="h-36 w-full" />
          ) : impactError ? (
            <Alert variant="destructive">
              <AlertDescription>{impactError}</AlertDescription>
            </Alert>
          ) : impact ? (
            <SyllabusStateCountsTable counts={impact.syllabi} total={impact.total} caption="Sílabos que se borran, por estado" />
          ) : null}
          <Field data-invalid={Boolean(deleteErrors.mensaje)}>
            <FieldLabel htmlFor="process-delete-message" required>
              Mensaje para docentes, coordinación y biblioteca
            </FieldLabel>
            <Textarea
              id="process-delete-message"
              value={deleteMessage}
              rows={3}
              maxLength={1000}
              aria-required="true"
              aria-invalid={Boolean(deleteErrors.mensaje)}
              onChange={(event) => setDeleteMessage(event.target.value)}
            />
            <FieldDescription>Les llega como aviso y por correo</FieldDescription>
            <FieldError errors={deleteErrors.mensaje} />
          </Field>
          <ConfirmPhrase id="process-delete-confirm" value={deleteTyped} onValueChange={setDeleteTyped} phrase={DELETE_PHRASE} />
          {deleteError ? (
            <Alert variant="destructive">
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" disabled={!deleteReady} onClick={() => void remove()}>
              {deleting ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}
              Eliminar periodo académico
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DeadlineExtensionDialog open={deadlineOpen} onOpenChange={setDeadlineOpen} process={process} display="menu" onSaved={(message) => void extended(message)} />
    </>
  )
}
