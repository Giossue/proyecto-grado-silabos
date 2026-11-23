import type { ReactNode } from "react"

export function TableCardLine({ children }: { children?: ReactNode }) {
  return <span data-card-line className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-normal text-muted-foreground sm:hidden">{children}</span>
}
