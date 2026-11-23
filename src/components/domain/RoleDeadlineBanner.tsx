"use client"

import { usePathname } from "next/navigation"
import { useEffect } from "react"
import { DeadlineBanner } from "@/components/domain/DeadlineBanner"
import { deadlineState, useDeadline } from "@/state/deadline"

export function RoleDeadlineBanner() {
  const pathname = usePathname()
  const { deadline, audience } = useDeadline()

  useEffect(() => {
    void deadlineState.refresh()
  }, [pathname])

  return deadline && audience ? <DeadlineBanner data-tour="deadline" deadline={deadline} audience={audience} /> : null
}
