"use client"

import { CalendarClock, CalendarPlus, Lock, Pause, Play, Trash2 } from "lucide-react"
import { Fragment } from "react"
import type { DialogAction } from "@/components/domain/DialogActions"
import type { ConvocationRow } from "@/components/domain/syllabus/convocationRows"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { useModelOpen } from "@/composables/useModelOpen"
import { cn, withoutFinalPeriod } from "@/lib/utils"

const EFFECTS: Record<string, string> = {
  abrir: "Fije las fechas de elaboración y entrega del período",
  "eliminar-periodo": "Borra el período y sus fechas",
  pausar: "Nadie edita, envía ni revisa hasta que la reanude",
  reanudar: "Se vuelve a editar, enviar y revisar",
  prorrogar: "Mueve la fecha de entrega hacia adelante",
  cerrar: "Los sílabos quedan solo para consulta",
  eliminar: "Borra la convocatoria y sus sílabos",
}

const actionsFor = (row: ConvocationRow): DialogAction[] => {
  const process = row.process
  if (!process) {
    const reason = row.lock_reason ?? undefined
    const locked = Boolean(reason)

    return [
      { key: "abrir", label: "Abrir convocatoria", icon: CalendarPlus, disabled: locked, disabledReason: reason },
      { key: "eliminar-periodo", label: "Eliminar periodo", icon: Trash2, destructive: true, disabled: locked, disabledReason: reason },
    ]
  }
  const active = process.state === "abierto" || process.state === "pausado"

  return [
    ...(process.state === "abierto" ? [{ key: "pausar", label: "Pausar", icon: Pause }] : []),
    ...(process.state === "pausado" ? [{ key: "reanudar", label: "Reanudar", icon: Play }] : []),
    {
      key: "prorrogar",
      label: "Prorrogar plazo",
      icon: CalendarClock,
      disabled: Boolean(process.extension_block_reason),
      disabledReason: process.extension_block_reason ?? undefined,
    },
    ...(active ? [{ key: "cerrar", label: "Finalizar", icon: Lock, destructive: true }] : []),
    ...(active ? [{ key: "eliminar", label: "Eliminar", icon: Trash2, destructive: true }] : []),
  ]
}

type ConvocationOptionsDialogProps = {
  row: ConvocationRow
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onAction?: (key: string) => void
}

export function ConvocationOptionsDialog({ row, open, onOpenChange, onAction }: ConvocationOptionsDialogProps) {
  const [isOpen, setOpen] = useModelOpen(open, onOpenChange)
  const actions = actionsFor(row)
  const groups = [actions.filter((action) => !action.destructive), actions.filter((action) => action.destructive)].filter((group) => group.length > 0)

  const run = (key: string): void => {
    setOpen(false)
    onAction?.(key)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Convocatoria {row.code}</DialogTitle>
          <DialogDescription>Elija qué hacer con la convocatoria</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {groups.map((group, groupIndex) => (
            <Fragment key={groupIndex}>
              {groupIndex > 0 ? <Separator /> : null}
              <ul className="flex flex-col gap-1" aria-label={groupIndex === 0 ? "Opciones de la convocatoria" : "Opciones delicadas"}>
                {group.map((action) => {
                  const Icon = action.icon

                  return (
                    <li key={action.key}>
                      <Button
                        type="button"
                        variant="ghost"
                        className={cn(
                          "h-auto w-full items-start justify-start gap-3 whitespace-normal px-3 py-2.5 text-left font-normal",
                          action.destructive && "text-destructive hover:bg-destructive/10 hover:text-destructive",
                        )}
                        disabled={action.disabled}
                        aria-describedby={`option-effect-${action.key}`}
                        onClick={() => run(action.key)}
                      >
                        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="font-medium">{action.label}</span>
                          <span id={`option-effect-${action.key}`} className={cn("text-sm", action.destructive ? "text-destructive/80" : "text-muted-foreground")}>
                            {action.disabled && action.disabledReason ? withoutFinalPeriod(action.disabledReason) : EFFECTS[action.key]}
                          </span>
                        </span>
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </Fragment>
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
