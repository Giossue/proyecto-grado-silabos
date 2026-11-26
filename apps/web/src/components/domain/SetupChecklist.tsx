"use client"

import { checklist, type Checklist } from "driver.js/checklist"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"
import { useCurrentFullPath } from "@/composables/useCurrentUrl"
import { useScrollDirection } from "@/composables/useScrollDirection"
import { setupRoutes } from "@/lib/setupRoutes"
import { deadlineState } from "@/state/deadline"
import { sessionState, useSession } from "@/state/session"
import { setupChecklistState, useSetupChecklist } from "@/state/setupChecklist"
import { useSignal } from "@/lib/signal"
import "driver.js/dist/checklist.css"

const plain = (text: string): string => text.replace(/\.$/, "")

const seenKey = (): string => {
  const session = sessionState.current.value

  return `setup-checklist-seen:${session?.user?.id}:${session?.active_role?.id}`
}

export function SetupChecklist() {
  const router = useRouter()
  const fullPath = useCurrentFullPath()
  const { session } = useSession()
  const role = session?.active_role?.code ?? ""
  const { setup, steps, start, openRequests } = useSetupChecklist()
  const deadlineValue = useSignal(deadlineState.deadline)
  const { hidden } = useScrollDirection()
  const panel = useRef<Checklist | null>(null)
  const titleGuard = useRef<MutationObserver | null>(null)

  const deadlineStatus = deadlineValue?.state
  const openedDescription = deadlineStatus === "paused"
    ? "El periodo académico está en pausa"
    : deadlineStatus === "closed"
      ? "El periodo académico finalizó"
      : "El periodo académico ya está abierto"
  const complete = start?.done
    ? { title: "Todo listo", description: openedDescription }
    : !start || start.action
      ? { title: "Todo listo", description: "Ya puede abrir el periodo académico" }
      : { title: "Pasos completos", description: plain(start.hint) }
  const doneCount = steps.filter((step) => step.done).length
  const signature = JSON.stringify({ setup, role, complete })

  const syncScrollHidden = (value: boolean): void => {
    document.querySelector(".driver-checklist.setup-checklist")?.toggleAttribute("data-scroll-hidden", value)
  }

  useEffect(() => {
    const point = (key: string): void => {
      const target = setupRoutes[role]?.[key]
      panel.current?.close()
      if (target) router.push(target)
    }

    const guardTooltip = (): void => {
      titleGuard.current?.disconnect()
      const launcher = document.querySelector<HTMLElement>(".setup-checklist .driver-checklist-launcher")
      if (!launcher) return
      launcher.dataset.tip = launcher.querySelector(".driver-checklist-launcher-text")?.textContent?.trim() || "Antes de empezar"
      launcher.removeAttribute("title")
      titleGuard.current = new MutationObserver(() => launcher.removeAttribute("title"))
      titleGuard.current.observe(launcher, { attributes: true, attributeFilter: ["title"] })
    }

    const wasOpen = panel.current?.isOpen() ?? false
    panel.current?.hide()
    panel.current = null
    if (steps.length === 0) return
    panel.current = checklist({
      id: `setup-${role}`,
      title: setup?.title,
      description: "Complete estos pasos para poder abrir el periodo académico",
      launcherText: "Antes de empezar",
      progressText: "{{done}} de {{total}}",
      launcherProgressText: "{{done}}/{{total}}",
      completeTitle: complete.title,
      completeDescription: complete.description,
      completeLauncherText: complete.title,
      className: doneCount < steps.length ? "setup-checklist setup-pending" : "setup-checklist setup-done",
      completed: steps.filter((step) => step.done).map((step) => step.key),
      items: steps.map((step) => ({
        id: step.key,
        title: plain(step.label),
        description: step.done ? undefined : plain(step.hint),
        action: () => point(step.key),
        completeWhen: () => step.done,
      })),
    })
    panel.current.show()
    guardTooltip()
    const firstTime = doneCount < steps.length && !localStorage.getItem(seenKey())
    if (firstTime) localStorage.setItem(seenKey(), "1")
    if (firstTime || wasOpen) panel.current.open()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  useEffect(() => {
    syncScrollHidden(hidden)
  }, [hidden, signature])

  useEffect(() => {
    if (openRequests > 0) panel.current?.open()
  }, [openRequests])

  useEffect(() => {
    void deadlineState.refresh()
    void setupChecklistState.refresh()
  }, [fullPath])

  useEffect(() => () => {
    titleGuard.current?.disconnect()
    panel.current?.hide()
  }, [])

  return <span hidden data-setup-checklist />
}
