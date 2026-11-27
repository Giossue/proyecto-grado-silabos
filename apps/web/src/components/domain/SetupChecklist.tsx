"use client"

import { checklist, type Checklist } from "driver.js/checklist"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"
import { useCurrentFullPath } from "@/composables/useCurrentUrl"
import { useScrollDirection } from "@/composables/useScrollDirection"
import { setupRoutes } from "@/lib/setupRoutes"
import { toast } from "@/lib/toast"
import { deadlineState } from "@/state/deadline"
import { sessionState, useSession } from "@/state/session"
import { setupChecklistState, useSetupChecklist } from "@/state/setupChecklist"
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
  const { hidden } = useScrollDirection()
  const panel = useRef<Checklist | null>(null)
  const titleGuard = useRef<MutationObserver | null>(null)
  const handledRequests = useRef(openRequests)

  const pending = steps.some((step) => !step.done)
  const started = start?.done === true
  const label = started ? "Pendientes" : "Antes de empezar"
  const signature = JSON.stringify({ setup, role })

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
      launcher.dataset.tip = launcher.querySelector(".driver-checklist-launcher-text")?.textContent?.trim() || label
      launcher.removeAttribute("title")
      titleGuard.current = new MutationObserver(() => launcher.removeAttribute("title"))
      titleGuard.current.observe(launcher, { attributes: true, attributeFilter: ["title"] })
    }

    const wasOpen = panel.current?.isOpen() ?? false
    panel.current?.hide()
    panel.current = null
    if (!pending) return
    panel.current = checklist({
      id: `setup-${role}`,
      title: started ? label : setup?.title,
      description: started ? "Esta lista no pausa el proceso de sílabos" : "Revise estos pasos antes de abrir el proceso de sílabos",
      launcherText: label,
      progressText: "{{done}} de {{total}}",
      launcherProgressText: "{{done}}/{{total}}",
      className: "setup-checklist setup-pending",
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
    // The library names its close button in English and has no option to change it.
    document.querySelector(".setup-checklist .driver-checklist-close-btn")?.setAttribute("aria-label", "Cerrar la lista")
    guardTooltip()
    const firstTime = !localStorage.getItem(seenKey())
    if (firstTime) localStorage.setItem(seenKey(), "1")
    if (firstTime || wasOpen) panel.current.open()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  useEffect(() => {
    syncScrollHidden(hidden)
  }, [hidden, signature])

  useEffect(() => {
    if (openRequests === handledRequests.current) return
    handledRequests.current = openRequests
    if (panel.current) panel.current.open()
    else if (start && !start.done) toast.info(start.hint)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
