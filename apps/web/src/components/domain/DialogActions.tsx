"use client"

import type { LucideIcon } from "lucide-react"
import { Fragment } from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn, withoutFinalPeriod } from "@/lib/utils"

export type DialogAction = {
  key: string
  label: string
  icon: LucideIcon
  destructive?: boolean
  disabled?: boolean
  disabledReason?: string
  loading?: boolean
}

export function DialogActions({ actions, onSelect }: { actions: DialogAction[]; onSelect: (key: string) => void }) {
  return actions.map((action) => {
    const explained = Boolean(action.disabled && action.disabledReason)
    const Icon = action.icon
    const button = (
      <span className="inline-flex" tabIndex={explained ? 0 : undefined}>
        <Button
          type="button"
          variant="outline"
          className={cn(action.destructive && "text-destructive hover:bg-destructive/10 hover:text-destructive")}
          aria-label={action.label}
          aria-describedby={explained ? `dialog-action-reason-${action.key}` : undefined}
          disabled={action.disabled || action.loading}
          onClick={() => onSelect(action.key)}
        >
          {action.loading ? <Spinner data-icon="inline-start" /> : <Icon data-icon="inline-start" aria-hidden="true" />}
          {action.label}
        </Button>
      </span>
    )

    return (
      <Fragment key={action.key}>
        {explained ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent>{withoutFinalPeriod(action.disabledReason ?? "")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          button
        )}
        {explained ? (
          <span id={`dialog-action-reason-${action.key}`} className="sr-only">
            {action.disabledReason}
          </span>
        ) : null}
      </Fragment>
    )
  })
}
