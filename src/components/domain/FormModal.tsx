"use client"

import { Plus } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useModelOpen } from "@/composables/useModelOpen"
import { useFocusReturn } from "@/lib/focusReturn"
import { cn } from "@/lib/utils"

type FormModalProps = {
  triggerLabel: string
  title?: string
  description?: string
  showTrigger?: boolean
  disabled?: boolean
  fullScreen?: boolean
  wide?: boolean
  narrow?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: ReactNode
  children?: ReactNode | ((slot: { close: () => void }) => ReactNode)
}

export function FormModal({
  triggerLabel,
  title,
  description,
  showTrigger = true,
  disabled = false,
  fullScreen = false,
  wide = false,
  narrow = false,
  open,
  onOpenChange,
  trigger,
  children,
}: FormModalProps) {
  const [isOpen, setOpen] = useModelOpen(open, onOpenChange)
  useFocusReturn(isOpen)
  const close = (): void => setOpen(false)

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {showTrigger ? (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button className="w-full max-sm:size-14 max-sm:rounded-full max-sm:p-0 sm:w-auto" aria-label={triggerLabel} disabled={disabled}>
              <Plus data-icon="inline-start" aria-hidden="true" />
              <span className="max-sm:hidden">{triggerLabel}</span>
            </Button>
          )}
        </DialogTrigger>
      ) : null}
      <DialogContent
        {...(description ? {} : { "aria-describedby": undefined })}
        aria-label={title ? undefined : triggerLabel}
        className={cn("flex flex-col gap-0 overflow-hidden p-0", {
          "top-0 left-0 h-dvh max-h-none w-full max-w-none translate-x-0 translate-y-0 rounded-none border-0 sm:max-w-none": fullScreen,
          "sm:max-w-4xl": wide && !fullScreen,
          "sm:max-w-sm": narrow && !wide && !fullScreen,
          "sm:max-w-lg": !narrow && !wide && !fullScreen,
        })}
      >
        {title ? (
          <DialogHeader className="p-4">
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
        ) : (
          <DialogTitle className="sr-only" close={false}>
            {triggerLabel}
          </DialogTitle>
        )}
        <ScrollArea className="min-h-0 flex-1">
          <div className={cn("px-4 pb-28", title ? "pt-1" : "pt-4")}>{typeof children === "function" ? children({ close }) : children}</div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
