import type { ReactNode } from "react"
import { SidebarInset } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import type { AppVariant } from "@/types"

export function AppContent({ variant = "sidebar", className, children }: { variant?: AppVariant; className?: string; children: ReactNode }) {
  if (variant === "sidebar") {
    return (
      <SidebarInset id="contenido" tabIndex={-1} className={cn("outline-hidden", className)}>
        {children}
      </SidebarInset>
    )
  }

  return (
    <main id="contenido" tabIndex={-1} className={cn("mx-auto flex h-full w-full max-w-7xl flex-1 flex-col gap-4 rounded-md", className)}>
      {children}
    </main>
  )
}
