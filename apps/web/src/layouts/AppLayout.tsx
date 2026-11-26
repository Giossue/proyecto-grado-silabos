import type { ReactNode } from "react"
import { AppSidebarLayout } from "@/layouts/app/AppSidebarLayout"
import type { BreadcrumbItem } from "@/types"

export function AppLayout({ breadcrumbs = [], children }: { breadcrumbs?: BreadcrumbItem[]; children: ReactNode }) {
  return <AppSidebarLayout breadcrumbs={breadcrumbs}>{children}</AppSidebarLayout>
}
