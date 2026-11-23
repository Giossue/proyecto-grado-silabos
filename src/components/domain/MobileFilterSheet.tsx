"use client"

import { Check, ListFilter, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { afterDialogExit } from "@/lib/dialogExit"
import { cn } from "@/lib/utils"

export function MobileFilterSheet({ className, children }: { className?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(false)
  const [activeCount, setActiveCount] = useState(0)
  const panel = useRef<HTMLDivElement>(null)

  const recount = useCallback((): void => {
    const node = panel.current
    if (node === null) return
    setActiveCount(
      Array.from(node.querySelectorAll<HTMLSelectElement | HTMLInputElement>('select, input[type="hidden"]')).filter(
        (field) => field.value !== "" && field.value !== "all",
      ).length,
    )
  }, [])

  const openSheet = (): void => {
    setOpen(true)
    setShown(true)
    recount()
  }
  const close = (): void => setOpen(false)

  useEffect(() => {
    const node = panel.current
    node?.addEventListener("change", recount)

    return () => node?.removeEventListener("change", recount)
  }, [recount])

  useEffect(() => {
    if (!open) {
      let cancelled = false
      void afterDialogExit().then(() => {
        if (!cancelled) setShown(false)
      })

      return () => {
        cancelled = true
      }
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"

    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open])

  return (
    <>
      <div className="contents sm:hidden">
        <Button type="button" variant="outline" className="w-full" aria-expanded={open} onClick={openSheet}>
          Filtros
          {activeCount > 0 ? (
            <Badge variant="secondary" className="ml-1">
              {activeCount}
            </Badge>
          ) : null}
        </Button>

        {shown ? (
          <div
            data-state={open ? "open" : "closed"}
            className="fixed inset-0 z-50 bg-overlay/50 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:fill-mode-forwards data-[state=open]:animate-in data-[state=open]:fade-in-0"
            aria-hidden="true"
            onClick={close}
          />
        ) : null}
      </div>

      <div
        ref={panel}
        className={cn(
          className,
          "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-50 max-sm:max-h-(--filter-sheet-max-height)",
          "max-sm:flex max-sm:flex-col max-sm:gap-3 max-sm:overflow-hidden",
          "max-sm:rounded-t-xl max-sm:bg-card max-sm:p-4",
          "max-sm:pb-(--safe-footer-inset)",
          "max-sm:shadow-modal max-sm:ring-1 max-sm:ring-surface-ring",
          "max-sm:duration-200 max-sm:data-[state=open]:animate-in max-sm:data-[state=open]:fade-in-0 max-sm:data-[state=open]:slide-in-from-bottom",
          "max-sm:data-[state=closed]:animate-out max-sm:data-[state=closed]:fade-out-0 max-sm:data-[state=closed]:slide-out-to-bottom max-sm:data-[state=closed]:fill-mode-forwards",
          !shown && "max-sm:hidden",
        )}
        data-state={open ? "open" : "closed"}
        role="group"
        aria-label="Filtros de la tabla"
      >
        <div className="flex items-center justify-between sm:hidden">
          <span className="flex items-center gap-2 font-medium">
            <ListFilter className="size-4" aria-hidden="true" />
            Filtros
          </span>
          <IconTooltip label="Cerrar filtros">
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Cerrar filtros" onClick={close}>
              <X aria-hidden="true" />
            </Button>
          </IconTooltip>
        </div>

        <div className="max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col max-sm:gap-4 max-sm:overflow-y-auto sm:contents">{children}</div>

        <div className="-mx-4 shrink-0 border-t px-4 pt-4 sm:hidden">
          <Button type="button" className="w-full" onClick={close}>
            <Check data-icon="inline-start" aria-hidden="true" />
            Ver resultados
          </Button>
        </div>
      </div>
    </>
  )
}
