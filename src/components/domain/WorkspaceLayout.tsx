import type { ReactNode } from "react"

export function WorkspaceLayout({ variant, children }: { variant: "syllabus" | "review"; children?: ReactNode }) {
  return (
    <div className="workspace-layout grid min-w-0 gap-6" data-layout={variant}>
      {children}
    </div>
  )
}
