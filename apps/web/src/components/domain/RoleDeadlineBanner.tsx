"use client"

import { usePathname } from "next/navigation"
import { useEffect } from "react"
import { DeadlineBanner } from "@/components/domain/DeadlineBanner"
import { DeadlineChip } from "@/components/domain/DeadlineChip"
import { deadlineState, useDeadline } from "@/state/deadline"

export function RoleDeadlineBanner() {
  const pathname = usePathname()
  const { deadline, audience } = useDeadline()

  useEffect(() => {
    void deadlineState.refresh()
  }, [pathname])

  if (!deadline || !audience) return null
  const banner = <DeadlineBanner deadline={deadline} audience={audience} />

  return deadline.state === "overdue" ? banner : <div className="sm:hidden">{banner}</div>
}

export function RoleDeadlineChip() {
  const { deadline, audience } = useDeadline()

  return deadline && audience ? <DeadlineChip deadline={deadline} audience={audience} /> : null
}
