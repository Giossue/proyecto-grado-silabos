"use client"

import * as React from "react"

const EPSILON = 1

type HorizontalOverflow = {
  canScrollLeft: boolean
  canScrollRight: boolean
  overflows: boolean
}

const NONE: HorizontalOverflow = {
  canScrollLeft: false,
  canScrollRight: false,
  overflows: false,
}

const sameOverflow = (a: HorizontalOverflow, b: HorizontalOverflow): boolean =>
  a.canScrollLeft === b.canScrollLeft &&
  a.canScrollRight === b.canScrollRight &&
  a.overflows === b.overflows

export function useHorizontalOverflow(
  element: HTMLElement | null
): HorizontalOverflow {
  const [state, setState] = React.useState<HorizontalOverflow>(NONE)

  React.useEffect(() => {
    if (element === null) return
    const measure = () => {
      const maxScroll = element.scrollWidth - element.clientWidth
      const next = {
        overflows: maxScroll > EPSILON,
        canScrollLeft: element.scrollLeft > EPSILON,
        canScrollRight: element.scrollLeft < maxScroll - EPSILON,
      }
      setState((previous) => (sameOverflow(previous, next) ? previous : next))
    }
    element.addEventListener("scroll", measure, { passive: true })
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    for (const child of Array.from(element.children)) observer.observe(child)
    measure()
    return () => {
      element.removeEventListener("scroll", measure)
      observer.disconnect()
    }
  }, [element])

  return state
}
