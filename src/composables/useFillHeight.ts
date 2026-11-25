import { useEffect, useState, type RefObject } from "react"

const VIEWPORT = '[data-slot="scroll-area-viewport"]'

const measure = (element: HTMLElement): number | null => {
  const viewport = element.closest<HTMLElement>(VIEWPORT)
  if (!viewport) return null
  const offset = element.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop
  const gap = element.parentElement ? Number.parseFloat(getComputedStyle(element.parentElement).paddingBottom) || 0 : 0

  return Math.floor(viewport.clientHeight - offset - gap)
}

export function useFillHeight(element: RefObject<HTMLElement | null>, enabled = true): number | null {
  const [height, setHeight] = useState<number | null>(null)

  useEffect(() => {
    const target = element.current
    if (!enabled || !target) return
    const update = (): void => setHeight(measure(target))
    const viewport = target.closest<HTMLElement>(VIEWPORT)
    const observer = new ResizeObserver(update)
    if (viewport) observer.observe(viewport)
    if (viewport?.firstElementChild) observer.observe(viewport.firstElementChild)
    window.addEventListener("resize", update)
    update()

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [element, enabled])

  return enabled ? height : null
}
