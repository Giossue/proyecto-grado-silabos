"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { useCurrentFullPath } from "@/composables/useCurrentUrl"
import { rememberIntendedRoute } from "@/lib/intended-route"
import { guardNavigation, requiresSession, type GuardResult } from "@/lib/navigationGuard"
import { announcePage } from "@/lib/pageAnnouncement"
import { sessionState, useSession } from "@/state/session"
import { trackSettingsReturn } from "@/state/settingsReturn"

type Decision = { fullPath: string; result: GuardResult }

export default function RouteGuard({ children }: { children: ReactNode }) {
  const router = useRouter()
  const fullPath = useCurrentFullPath()
  const { session, loaded } = useSession()
  const [decision, setDecision] = useState<Decision | null>(null)
  const confirmed = useRef<string | null>(null)
  const needsSession = requiresSession(fullPath)

  const result: GuardResult | null =
    decision?.fullPath === fullPath
      ? decision.result
      : !needsSession || loaded
        ? guardNavigation(fullPath, needsSession ? session : null)
        : null

  useEffect(() => {
    let cancelled = false
    const decide = async (): Promise<void> => {
      const current = requiresSession(fullPath) ? await sessionState.load() : null
      if (cancelled) return
      const next = guardNavigation(fullPath, current)
      if (next.remember) rememberIntendedRoute(next.remember.value, next.remember.recognized)
      setDecision({ fullPath, result: next })
      if (!next.allow) {
        router.replace(next.redirect)
        return
      }
      trackSettingsReturn(fullPath, confirmed.current)
      announcePage(fullPath, confirmed.current)
      confirmed.current = fullPath
    }
    decide().catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [fullPath, router])

  return result?.allow ? children : null
}
