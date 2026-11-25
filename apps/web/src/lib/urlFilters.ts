type QueryValue = string | null | undefined | (string | null)[]

type ReplaceRouter = { replace: (href: string, options?: { scroll?: boolean }) => void }

export const queryText = (value: QueryValue): string => (typeof value === "string" ? value : "")

export const queryPage = (value: QueryValue): number => Number(queryText(value)) || 1

export const queryOf = (params: URLSearchParams): Record<string, string | string[]> => {
  const query: Record<string, string | string[]> = {}
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key)
    query[key] = values.length === 1 ? (values[0] ?? "") : values
  }

  return query
}

let leaving: string | null = null
let tracking = false

const leavingTarget = (event: MouseEvent): URL | null => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null
  const link = event.target instanceof Element ? event.target.closest("a[href]") : null
  if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download")) return null
  if (link.target !== "" && link.target !== "_self") return null
  const url = new URL(link.href, window.location.href)

  return url.origin === window.location.origin && url.pathname !== window.location.pathname ? url : null
}

export const trackLeaving = (): void => {
  if (tracking || typeof document === "undefined") return
  tracking = true
  document.addEventListener(
    "click",
    (event) => {
      if (leavingTarget(event)) leaving = window.location.pathname
    },
    true,
  )
}

trackLeaving()

export const syncFilters = (router: ReplaceRouter, filters: Record<string, string>, page: number): void => {
  const { pathname, search } = window.location
  if (leaving !== null) {
    if (leaving === pathname) return
    leaving = null
  }
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== "" && value !== "all") query.set(key, value)
  }
  if (page > 1) query.set("page", String(page))
  const next = query.toString()
  if (`?${next}` === search || (next === "" && search === "")) return
  router.replace(`${pathname}${next === "" ? "" : `?${next}`}`, { scroll: false })
}
