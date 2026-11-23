"use client"

import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type InsertAction = { key: string; label: string }

type TemplateInsertPointProps = {
  actions: InsertAction[]
  position: "top" | "bottom" | "inline"
  gap: "field" | "section"
  disabled?: boolean
  onInsert: (key: string) => void
}

export function TemplateInsertPoint({ actions, position, gap, disabled = false, onInsert }: TemplateInsertPointProps) {
  return (
    <div
      className={cn(
        "group/insert absolute inset-x-0 z-0 flex items-center justify-center gap-2",
        position === "inline" ? "inset-y-0" : "h-6",
        position === "top" && (gap === "field" ? "-top-4.5" : "-top-6"),
        position === "bottom" && (gap === "field" ? "-bottom-4.5" : "-bottom-6"),
      )}
      data-insert-point
    >
      <span className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-primary/60 opacity-0 transition-opacity group-hover/insert:opacity-100" aria-hidden="true" />
      {actions.map((action) => (
        <Button
          key={action.key}
          type="button"
          size="sm"
          tabIndex={-1}
          className="relative h-6 rounded-full px-2.5 font-sans text-xs opacity-0 shadow-menu transition-opacity group-hover/insert:opacity-100 focus-visible:opacity-100"
          disabled={disabled}
          aria-label={action.label}
          onClick={() => onInsert(action.key)}
        >
          <Plus data-icon="inline-start" aria-hidden="true" />
          {action.label}
        </Button>
      ))}
    </div>
  )
}
