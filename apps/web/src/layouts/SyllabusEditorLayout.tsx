import type { ReactNode } from "react"
import { ScreenHelpButton } from "@/components/domain/ScreenHelpButton"
import { TooltipProvider } from "@/components/ui/tooltip"

export function SyllabusEditorLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh min-w-0 bg-background text-foreground">
      <TooltipProvider>
        <main id="contenido" tabIndex={-1} className="min-h-dvh w-full outline-hidden">
          {children}
        </main>
        <ScreenHelpButton editorMode corner="left" />
      </TooltipProvider>
    </div>
  )
}
