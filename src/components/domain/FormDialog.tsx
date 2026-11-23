"use client"

import { Plus } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useModelOpen } from "@/composables/useModelOpen"
import { cn } from "@/lib/utils"

type FormDialogProps = {
  triggerLabel: string
  title: string
  description?: string
  showTrigger?: boolean
  disabled?: boolean
  compact?: boolean
  fit?: boolean
  wide?: boolean
  noFooter?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: ReactNode
  headerActions?: ReactNode
  children?: ReactNode | ((slot: { close: () => void }) => ReactNode)
}

export function FormDialog({
  triggerLabel,
  title,
  description,
  showTrigger = true,
  disabled = false,
  compact = false,
  fit = false,
  wide = false,
  noFooter = false,
  open,
  onOpenChange,
  trigger,
  headerActions,
  children,
}: FormDialogProps) {
  const [isOpen, setOpen] = useModelOpen(open, onOpenChange)
  const close = (): void => setOpen(false)

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {showTrigger ? (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button aria-label={triggerLabel} disabled={disabled}>
              <Plus data-icon="inline-start" aria-hidden="true" />
              {triggerLabel}
            </Button>
          )}
        </DialogTrigger>
      ) : null}
      <DialogContent
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0",
          compact ? "sm:max-w-3xl" : wide ? "sm:max-w-7xl" : "sm:max-w-5xl",
          compact || fit ? "max-h-[calc(100dvh-2rem)]" : "h-[calc(100dvh-2rem)]",
        )}
      >
        {headerActions ? (
          <div data-slot="form-dialog-header-actions" className="absolute top-4 right-14 z-10 flex items-center gap-1">
            {headerActions}
          </div>
        ) : null}
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className={headerActions ? "px-20" : undefined}>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <ScrollArea className="min-h-0 flex-1">
            <div className={cn("px-6 pt-1", noFooter ? "pb-6" : "pb-28")}>{typeof children === "function" ? children({ close }) : children}</div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}
