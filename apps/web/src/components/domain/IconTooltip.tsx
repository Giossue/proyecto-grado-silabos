"use client"

import type { ComponentProps, ReactNode } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type IconTooltipProps = {
  label: string
  side?: ComponentProps<typeof TooltipContent>["side"]
  children: ReactNode
}

export function IconTooltip({ label, side, children }: IconTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
