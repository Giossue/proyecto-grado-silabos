"use client"

import { useRef, useState, type ReactNode } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export function MenuTooltip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLSpanElement>(null)
  const menuOpen = (): boolean => trigger.current?.querySelector('[aria-expanded="true"]') != null
  const close = (): void => setOpen(false)

  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={(next) => setOpen(next && !menuOpen())}>
        <TooltipTrigger asChild>
          <span ref={trigger} className="inline-flex" onPointerDownCapture={close} onKeyDownCapture={close}>
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
