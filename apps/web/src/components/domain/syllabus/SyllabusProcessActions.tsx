"use client"

import { CalendarClock, Lock, Pause, Play, Trash2 } from "lucide-react"
import { useImperativeHandle, useState, type ReactNode, type Ref } from "react"
import { ApiError } from "@/api/client"
import { deleteProcess, getProcessImpact, transitionProcess, type ProcessImpact, type SyllabusProcess } from "@/api/processes"
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
import { afterDialogExit } from "@/lib/dialogExit"
import { toast } from "@/lib/toast"
import { withoutFinalPeriod } from "@/lib/utils"

type Transition = "pausar" | "reanudar" | "cerrar"

export type ProcessActionKey = Transition | "prorrogar" | "eliminar"

export type SyllabusProcessActionsHandle = { run: (key: ProcessActionKey) => void }

type SyllabusProcessActionsProps = {
  process: SyllabusProcess
  menu?: boolean
  onCompleted?: (message: string) => void
  children?: ReactNode
  ref?: Ref<SyllabusProcessActionsHandle>
}

const templateChanged = (cause: unknown): boolean => cause instanceof ApiError && cause.payload.code === "plantilla_cambiada"

export function SyllabusProcessActions({ process, menu = true, onCompleted, children, ref }: SyllabusProcessActionsProps) {
  const [processing, setProcessing] = useState(false)
  const [deadlineOpen, setDeadlineOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string[]>>({})
  const [deleteMessage, setDeleteMessage] = useState("")
  const [impact, setImpact] = useState<ProcessImpact | null>(null)
  const [impactLoading, setImpactLoading] = useState(false)
  const [impactError, setImpactError] = useState<string | null>(null)

  const deleteReady = !deleting && deleteMessage.trim() !== ""

  const loadImpact = async (): Promise<void> => {
    setImpact(null)
    setImpactLoading(true)
    setImpactError(null)
    try {
      setImpact(await getProcessImpact(process.id))
    } catch {
      setImpactError("No se pudo saber cuántos sílabos se borran. Inténtelo de nuevo")
    } finally {
      setImpactLoading(false)
    }
  }

  const begin = async (transition: Transition): Promise<void> => {
    if (processing) return
    setProcessing(true)
    try {
      const response = await transitionProcess(process.id, transition).catch((cause: unknown) => {
        if (transition === "reanudar" && templateChanged(cause)) return transitionProcess(process.id, transition, { confirmar_rehacer: true })
        throw cause
      })
      onCompleted?.(response.message)
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : "No se pudo cambiar el estado del proceso")
    } finally {
      setProcessing(false)
    }
  }

  const startDelete = (): void => {
    setDeleteError(null)
    setDeleteOpen(true)
    setDeleteMessage("")
    setDeleteErrors({})
    void loadImpact()
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
    else void begin(key)
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

  return (
    <>
      {menu ? (
        <TableActionsMenu label={`Acciones para ${process.name}`}>
          {children}
          {process.state === "abierto" ? (
            <DropdownMenuItem disabled={processing} onSelect={() => void begin("pausar")}>
              <Pause />
              Pausar
            </DropdownMenuItem>
          ) : null}
          {process.state === "pausado" ? (
            <DropdownMenuItem disabled={processing} onSelect={() => void begin("reanudar")}>
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
            <DropdownMenuItem variant="destructive" disabled={processing} onSelect={() => void begin("cerrar")}>
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
