import { useMemo } from "react"
import { vi } from "vitest"
import { signal, useSignal } from "@/lib/signal"

type Location = { pathname: string; search: string }

const parse = (href: string): Location => {
  const url = new URL(href, "http://localhost")
  return { pathname: url.pathname, search: url.search.replace(/^\?/, "") }
}

const location = signal<Location>({ pathname: "/", search: "" })

const set = (href: string): void => {
  const next = parse(href)
  location.value = next
  window.history.replaceState(null, "", `${next.pathname}${next.search ? `?${next.search}` : ""}`)
}

const push = vi.fn((href: string) => set(href))
const replace = vi.fn((href: string) => set(href))
const back = vi.fn()

export const navigation = {
  set,
  push,
  replace,
  back,
  get pathname(): string {
    return location.value.pathname
  },
  get fullPath(): string {
    const { pathname, search } = location.value
    return search ? `${pathname}?${search}` : pathname
  },
  reset(href = "/"): void {
    push.mockClear()
    replace.mockClear()
    back.mockClear()
    set(href)
  },
}

const router = { push, replace, back, forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }

export const useRouter = () => router

export const usePathname = (): string => useSignal(location).pathname

export const useSearchParams = (): URLSearchParams => {
  const { search } = useSignal(location)
  return useMemo(() => new URLSearchParams(search), [search])
}

export const useParams = (): Record<string, string> => ({})

export const redirect = (href: string): never => {
  throw new Error(`redirect:${href}`)
}

export const notFound = (): never => {
  throw new Error("not-found")
}
