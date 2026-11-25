import type { ReactNode } from "react"
import { SidebarProvider } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import type { AppVariant } from "@/types"

export function AppShell({ variant = "sidebar", className, children }: { variant?: AppVariant; className?: string; children: ReactNode }) {
  if (variant === "header") {
    return <div className={cn("flex min-h-screen w-full flex-col", className)}>{children}</div>
  }

  return <SidebarProvider className={className}>{children}</SidebarProvider>
}
