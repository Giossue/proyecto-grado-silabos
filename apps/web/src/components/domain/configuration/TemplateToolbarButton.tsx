"use client"

import { useState, type ComponentProps, type MouseEvent, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type TemplateToolbarButtonProps = {
  label: string
  tooltip?: string
  text?: string
  disabled?: boolean
  pressed?: boolean
  variant?: ComponentProps<typeof Button>["variant"]
  children?: ReactNode
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
}

export function TemplateToolbarButton({ label, tooltip, text, disabled = false, pressed, variant = "ghost", children, onClick }: TemplateToolbarButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button type="button" size={text ? "sm" : "icon-sm"} variant={variant} disabled={disabled} aria-label={label} aria-pressed={pressed} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={onClick}>
            {children}
            {text ? <span>{text}</span> : null}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip ?? label}</TooltipContent>
    </Tooltip>
  )
}
