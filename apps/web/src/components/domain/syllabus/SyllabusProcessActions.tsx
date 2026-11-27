"use client"

import { CalendarClock, Lock, Pause, Play, Trash2 } from "lucide-react"
import { useImperativeHandle, useState, type ReactNode, type Ref } from "react"
import { ApiError } from "@/api/client"
import { deleteProcess, transitionProcess, type SyllabusProcess } from "@/api/processes"
import { TableActionsMenu } from "@/components/domain/TableActionsMenu"
import { DeadlineExtensionDialog } from "@/components/domain/syllabus/DeadlineExtensionDialog"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
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

  const remove = async (): Promise<void> => {
    if (processing) return
    setProcessing(true)
    try {
      const response = await deleteProcess(process.id)
      onCompleted?.(response.message)
    } catch (cause) {
      toast.error(cause instanceof ApiError ? (cause.errors.process?.[0] ?? cause.message) : "No se pudo eliminar el proceso de sílabos")
    } finally {
      setProcessing(false)
    }
  }

  const extended = async (message: string): Promise<void> => {
    await afterDialogExit()
    onCompleted?.(message)
  }

  const run = (key: ProcessActionKey): void => {
    if (key === "prorrogar") setDeadlineOpen(true)
    else if (key === "eliminar") void remove()
    else void begin(key)
  }
  useImperativeHandle(ref, () => ({ run }))

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
            <DropdownMenuItem variant="destructive" disabled={processing} onSelect={() => void remove()}>
              <Trash2 aria-hidden="true" />
              Eliminar
            </DropdownMenuItem>
          ) : null}
        </TableActionsMenu>
      ) : null}

      <DeadlineExtensionDialog open={deadlineOpen} onOpenChange={setDeadlineOpen} process={process} display="menu" onSaved={(message) => void extended(message)} />
    </>
  )
}
