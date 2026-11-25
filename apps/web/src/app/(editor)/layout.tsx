import type { ReactNode } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SyllabusEditorLayout } from "@/layouts/SyllabusEditorLayout"

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <ScrollArea data-app-scroll className="h-dvh">
      <SyllabusEditorLayout>{children}</SyllabusEditorLayout>
    </ScrollArea>
  )
}
