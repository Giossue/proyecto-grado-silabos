import { useEffect, useRef } from "react"

type LeaveGuard = {
  needed: () => boolean
  confirm: () => Promise<boolean>
  navigate: (href: string) => void
}

const leavingHref = (event: MouseEvent): string | null => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null
  const link = event.target instanceof Element ? event.target.closest("a[href]") : null
  if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download")) return null
  if (link.target !== "" && link.target !== "_self") return null
  const url = new URL(link.href, window.location.href)
  if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return null

  return `${url.pathname}${url.search}${url.hash}`
}

export function useLeaveGuard(guard: LeaveGuard): void {
  const latest = useRef(guard)
  useEffect(() => {
    latest.current = guard
  })

  useEffect(() => {
    let deciding = false
    const intercept = (event: MouseEvent): void => {
      const href = leavingHref(event)
      if (href === null || !latest.current.needed()) return
      event.preventDefault()
      if (deciding) return
      deciding = true
      void latest.current
        .confirm()
        .then((allowed) => {
          if (allowed) latest.current.navigate(href)
        })
        .finally(() => {
          deciding = false
        })
    }
    document.addEventListener("click", intercept, true)

    return () => document.removeEventListener("click", intercept, true)
  }, [])
}
