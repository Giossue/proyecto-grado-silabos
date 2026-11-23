"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { AppLayout } from "@/layouts/AppLayout"
import { matchRoute } from "@/lib/routeTable"
import type { BreadcrumbItem } from "@/types"

export default function Layout({ children }: { children: ReactNode }) {
  const title = matchRoute(usePathname()).record.meta.title
  const breadcrumbs: BreadcrumbItem[] = typeof title === "string" && title !== "" ? [{ title }] : []

  return <AppLayout breadcrumbs={breadcrumbs}>{children}</AppLayout>
}
