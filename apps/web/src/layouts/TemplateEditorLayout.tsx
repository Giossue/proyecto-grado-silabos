import type { ReactNode } from "react"
import { PurgeConfirmationDialog } from "@/components/domain/PurgeConfirmationDialog"
import { TooltipProvider } from "@/components/ui/tooltip"

export function TemplateEditorLayout({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-dvh min-w-0 bg-muted/30 text-foreground">{children}</div>
      <PurgeConfirmationDialog />
    </TooltipProvider>
  )
}
