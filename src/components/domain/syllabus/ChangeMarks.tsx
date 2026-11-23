"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

type Mark = { top: number; element: HTMLElement }

const measureMarks = (root: HTMLElement | null): Mark[] => {
  const viewport = document.querySelector<HTMLElement>('[data-app-scroll] [data-slot="scroll-area-viewport"]')
  if (root === null || viewport === null) return []
  const origin = viewport.getBoundingClientRect().top - viewport.scrollTop

  return Array.from(root.querySelectorAll<HTMLElement>("[data-changed]")).map((element) => ({
    top: viewport.scrollHeight === 0 ? 0 : Math.min(98, Math.max(0, ((element.getBoundingClientRect().top - origin) / viewport.scrollHeight) * 100)),
    element,
  }))
}

export function ChangeMarks({ root }: { root: HTMLElement | null }) {
  const [marks, setMarks] = useState<Mark[]>([])

  useEffect(() => {
    const measure = (): void => setMarks(measureMarks(root))
    measure()
    if (root === null || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    const mutations = new MutationObserver(measure)
    mutations.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-changed"] })

    return () => {
      observer.disconnect()
      mutations.disconnect()
    }
  }, [root])

  if (marks.length === 0) return null

  return (
    <div className="pointer-events-none fixed top-14 right-3 bottom-0 z-20 hidden w-3 lg:block" aria-label="Cambios en el documento">
      {marks.map((mark, index) => (
        <Button
          key={index}
          type="button"
          variant="ghost"
          className="pointer-events-auto absolute right-0 h-1.5 min-h-0 w-3 rounded-full bg-warning p-0 hover:bg-warning"
          style={{ top: `${mark.top}%` }}
          aria-label={`Ir al cambio ${index + 1}`}
          onClick={() => mark.element.scrollIntoView({ behavior: "smooth", block: "center" })}
        />
      ))}
    </div>
  )
}
