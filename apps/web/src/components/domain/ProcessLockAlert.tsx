"use client"

import { Lock, type LucideIcon } from "lucide-react"
import Link from "next/link"
import type { LockDetail } from "@/api/locks"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { paths } from "@/lib/routes"
import { withoutFinalPeriod } from "@/lib/utils"
import { useSession } from "@/state/session"

type ProcessLockAlertProps = {
  lock?: LockDetail | null
  title?: string
  message?: string
  hideAction?: boolean
  icon?: LucideIcon
  banner?: boolean
  why?: string
}

export function ProcessLockAlert({ lock, title, message, hideAction, icon, banner, why }: ProcessLockAlertProps) {
  const isAdministrator = useSession().session?.active_role?.code === "administrador"
  const href = isAdministrator ? paths.admin.convocations : paths.coordination.reviews
  const actionLabel = isAdministrator ? "Ir a Periodos académicos" : "Ir a Revisión"
  const Icon = icon ?? Lock
  const headline = title ?? "Edición bloqueada"
  const summary = message ? withoutFinalPeriod(message) : isAdministrator ? "Pause el proceso para editar" : "Pause el proceso de sílabos de su carrera para editar"

  const reason = ((): string | null => {
    if (why) return why
    if (message || !lock) return null
    const open = "abierto"
    if (lock.scope === "process") {
      return `Hay un proceso de sílabos ${open}. No puede editar la plantilla mientras siga abierto, porque los docentes ya están llenando sus sílabos con ella. Para editarla, pause el proceso de sílabos. Al reanudar, si la plantilla cambió, se pedirá confirmación y los sílabos de este período se adaptarán a ella: se conserva lo escrito y los enviados o aprobados vuelven a borrador. Los de períodos anteriores no se tocan`
    }
    const consequence = "Si el cambio afecta sílabos enviados o aprobados, se pedirá confirmación y volverán a Borrador; se conserva lo escrito"
    const institutional = lock.institutional_pause ? "Administración pausó el proceso de sílabos, pero el de su carrera sigue abierto. " : ""

    return `${institutional}El proceso de sílabos de su carrera está ${open}. Pausarlo permite corregir la malla y el proyecto de carrera. ${consequence}`
  })()

  const reasonPopover = reason ? (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="link" size="sm" className="h-auto p-0">
          ¿Por qué?
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 text-sm">
        {reason}
      </PopoverContent>
    </Popover>
  ) : null

  const action = !hideAction ? (
    <Button asChild size="sm" variant="link" className="h-auto p-0">
      <Link href={href}>{actionLabel}</Link>
    </Button>
  ) : null

  if (banner) {
    return (
      <div
        role="status"
        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-primary/15 bg-accent px-4 py-1.5 text-sm text-accent-foreground sm:px-6 dark:border-primary/40 dark:bg-primary/25"
      >
        <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="font-medium">{headline}</span>
        <span className="text-accent-foreground/80">{summary}</span>
        {reasonPopover}
        {action}
      </div>
    )
  }

  return (
    <Alert className="w-fit max-w-full border-primary/20 bg-accent text-accent-foreground dark:border-primary/40 dark:bg-primary/25">
      <Icon className="text-primary" aria-hidden="true" />
      <AlertTitle>{headline}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2 text-accent-foreground/80">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{summary}</span>
          {reasonPopover}
        </span>
        {action}
      </AlertDescription>
    </Alert>
  )
}
