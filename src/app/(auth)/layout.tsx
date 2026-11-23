import type { ReactNode } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <ScrollArea data-app-scroll className="h-dvh">
      {children}
    </ScrollArea>
  )
}
