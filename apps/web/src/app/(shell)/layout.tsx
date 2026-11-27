"use client"

import { usePathname } from "next/navigation"
import { useCallback, useState, type ReactNode } from "react"
import NotFound from "@/app/not-found"
import { MissingPageContext } from "@/composables/useMissingPage"
import { useCurrentFullPath } from "@/composables/useCurrentUrl"
import { AppLayout } from "@/layouts/AppLayout"
import { matchRoute } from "@/lib/routeTable"
import type { BreadcrumbItem } from "@/types"

export default function Layout({ children }: { children: ReactNode }) {
  const title = matchRoute(usePathname()).record.meta.title
  const breadcrumbs: BreadcrumbItem[] = typeof title === "string" && title !== "" ? [{ title }] : []
  const address = useCurrentFullPath()
  const [missingAt, setMissingAt] = useState<string | null>(null)
  const showMissing = useCallback(() => setMissingAt(address), [address])
  if (missingAt !== null && missingAt !== address) setMissingAt(null)
  if (missingAt === address) return <NotFound />

  return (
    <MissingPageContext value={showMissing}>
      <AppLayout breadcrumbs={breadcrumbs}>{children}</AppLayout>
    </MissingPageContext>
  )
}
