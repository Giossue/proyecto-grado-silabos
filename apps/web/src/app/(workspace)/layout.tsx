import type { ReactNode } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { WorkspaceLayout } from "@/layouts/WorkspaceLayout"

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <ScrollArea data-app-scroll className="h-dvh">
      <WorkspaceLayout>{children}</WorkspaceLayout>
    </ScrollArea>
  )
}
