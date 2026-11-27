import { pathOf } from "@/lib/routeTable"

type BackRouter = { back: () => void; push: (href: string) => void }

let previous: string | null = null

export const trackNavigation = (to: string, from: string | null): void => {
  if (from !== null && pathOf(to) === pathOf(from)) return
  previous = from
}

export const goBack = (router: BackRouter, listPath: string): void => {
  if (previous !== null && pathOf(previous) === pathOf(listPath)) router.back()
  else router.push(listPath)
}
