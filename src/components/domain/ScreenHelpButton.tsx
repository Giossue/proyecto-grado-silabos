"use client"

import type { Driver, DriveStep } from "driver.js"
import { CircleHelp } from "lucide-react"
import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useCurrentFullPath } from "@/composables/useCurrentUrl"
import { useScrollDirection } from "@/composables/useScrollDirection"
import { helpScreens } from "@/lib/helpScreens"
import { scrollBehavior } from "@/lib/motion"
import { matchRoute } from "@/lib/routeTable"
import { screenTours } from "@/lib/screenTours"
import { cn } from "@/lib/utils"
import { useScreenHelp } from "@/state/screenHelp"

const loadDriver = async (): Promise<typeof import("driver.js").driver> => {
  const [module] = await Promise.all([import("driver.js"), import("driver.js/dist/driver.css")])

  return module.driver
}

const escape = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const visible = (selector: string): HTMLElement | null => {
  const element = document.querySelector<HTMLElement>(selector)

  return element && element.getClientRects().length > 0 ? element : null
}

export function ScreenHelpButton({ editorMode = false, corner = "right" }: { editorMode?: boolean; corner?: "left" | "right" }) {
  const pathname = usePathname()
  const fullPath = useCurrentFullPath()
  const { hidden } = useScrollDirection()
  const button = useRef<HTMLButtonElement | null>(null)
  const tour = useRef<Driver | null>(null)
  const screen = matchRoute(pathname).record.path
  const help = useScreenHelp(screen)
  const title = helpScreens.find((item) => item.key === screen)?.label ?? help?.title ?? ""
  const paragraphs = (help?.content ?? "").split(/\n{2,}/).map((text) => text.trim()).filter(Boolean)

  const stop = (): void => {
    tour.current?.destroy()
    tour.current = null
  }

  useEffect(() => {
    return () => {
      tour.current?.destroy()
      tour.current = null
    }
  }, [fullPath])

  const start = async (): Promise<void> => {
    const driver = await loadDriver()
    stop()
    const found = (screenTours[screen] ?? [])
      .map((item) => ({ item, element: visible(item.selector) }))
      .filter((entry): entry is { item: (typeof entry)["item"]; element: HTMLElement } => entry.element !== null)
    const intro = found.length === 0 ? paragraphs : paragraphs.slice(0, 1)
    const steps: DriveStep[] = [
      { popover: { title, description: intro.map(escape).join("<br><br>") } },
      ...found.map(({ item, element }) => ({ element, popover: { title: item.title, description: escape(item.description), side: item.side ?? "bottom", align: "center" as const } })),
    ]
    tour.current = driver({
      steps,
      popoverClass: "setup-popover screen-tour",
      showProgress: found.length > 0,
      progressText: "{{current}} de {{total}}",
      nextBtnText: "Siguiente",
      prevBtnText: "Anterior",
      doneBtnText: "Listo",
      showButtons: found.length > 0 ? ["next", "previous", "close"] : ["close"],
      disableActiveInteraction: true,
      smoothScroll: scrollBehavior() === "smooth",
      stagePadding: 6,
      stageRadius: 8,
      overlayOpacity: 0.55,
      onDestroyed: () => {
        tour.current = null
        button.current?.focus({ focusVisible: false } as FocusOptions)
      },
    })
    tour.current.drive()
  }

  if (!help) return null

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={button}
            type="button"
            size="icon"
            variant="secondary"
            className={cn(
              "fixed scroll-lock-offset z-40 size-12 rounded-full bg-ring text-background shadow-menu hover:bg-ring/90 [&_svg]:size-5",
              "max-sm:left-4", editorMode ? "max-sm:bottom-20" : "max-sm:bottom-(--page-mobile-actions-bottom)", corner === "left" ? "sm:left-4" : "sm:right-4",
              editorMode ? "sm:bottom-4" : "sm:bottom-20",
              "max-sm:transition-all max-sm:duration-200 max-sm:ease-out",
              hidden && "max-sm:pointer-events-none max-sm:translate-y-24 max-sm:opacity-0",
            )}
            aria-label="Ayuda de esta pantalla"
            onClick={() => void start()}
          >
            <CircleHelp aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side={corner === "left" ? "right" : "left"}>Ayuda de esta pantalla</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
