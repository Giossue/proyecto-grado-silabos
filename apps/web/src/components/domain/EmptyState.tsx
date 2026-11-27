import { Inbox, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { withoutEndPeriod } from "@/lib/text"
import { cn } from "@/lib/utils"

type EmptyStateProps = {
  title: string
  description?: string
  icon?: LucideIcon
  className?: string
  children?: ReactNode
  /** Without the card behind it, for places that already are a surface (a popover). */
  bare?: boolean
  "data-tour"?: string
}

export function EmptyState({ title, description, icon: Icon = Inbox, className, children, bare = false, "data-tour": tour }: EmptyStateProps) {
  const Surface = bare ? "div" : Card

  return (
    <Surface data-tour={tour} className={cn(!bare && "py-0", className)}>
      <Empty className="gap-3 border-0 p-6 md:p-10">
        <EmptyHeader className="gap-3">
          <EmptyMedia className="text-muted-foreground [&_svg]:size-6"><Icon aria-hidden="true" /></EmptyMedia>
          <EmptyTitle className="text-sm font-normal text-muted-foreground">{withoutEndPeriod(title)}</EmptyTitle>
          {description ? <EmptyDescription>{withoutEndPeriod(description)}</EmptyDescription> : null}
        </EmptyHeader>
        {children}
      </Empty>
    </Surface>
  )
}
