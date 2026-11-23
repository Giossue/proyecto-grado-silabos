import type { ReactNode } from "react"

import { withoutEndPeriod } from "@/lib/text"

const isText = (node: ReactNode): node is string | number =>
  typeof node === "string" || typeof node === "number"

export function withoutFinalPeriodText(children: ReactNode): ReactNode {
  if (isText(children)) return withoutEndPeriod(String(children))
  if (Array.isArray(children) && children.length > 0 && children.every(isText))
    return withoutEndPeriod(children.join(""))
  return children
}
