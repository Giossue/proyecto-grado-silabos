"use client"

import { Suspense, type MouseEvent, type ReactNode } from "react"
import AppEvents from "@/components/AppEvents"
import RouteGuard from "@/components/RouteGuard"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { CONTENT_ID, focusContent } from "@/lib/pageAnnouncement"

const skipToContent = (event: MouseEvent<HTMLAnchorElement>): void => {
  event.preventDefault()
  focusContent()
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <AppEvents />
      <a href={`#${CONTENT_ID}`} className="sr-only z-50 rounded-md bg-background px-4 py-2 text-sm font-medium text-foreground shadow-menu focus:not-sr-only focus:fixed focus:top-2 focus:left-2" onClick={skipToContent}>Saltar al contenido</a>
      <Suspense fallback={null}>
        <RouteGuard>{children}</RouteGuard>
      </Suspense>
      <Toaster position="top-center" expand />
    </TooltipProvider>
  )
}
