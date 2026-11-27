"use client"

import type { ReactNode } from "react"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

type TemplateRibbonGroupProps = {
  label: string
  caption?: boolean
  note?: ReactNode
  className?: string
  children: ReactNode
}

export function TemplateRibbonGroup({ label, caption = true, note, className, children }: TemplateRibbonGroupProps) {
  return (
    <div role="group" aria-label={label} data-ribbon-group={label} className={cn("flex shrink-0 flex-col items-center justify-between gap-1 px-1", className)}>
      <div className="flex min-h-8 items-center gap-0.5">{children}</div>
      {note ?? (caption ? (
        <span className="text-xs leading-none text-muted-foreground" aria-hidden="true" data-ribbon-caption>
          {label}
        </span>
      ) : null)}
    </div>
  )
}

export function TemplateRibbonDivider() {
  return <Separator orientation="vertical" className="mx-1 self-stretch data-[orientation=vertical]:h-auto" />
}
