"use client"

import { Menu } from "lucide-react"
import Image from "next/image"
import { AccessibilityDialog } from "@/components/AccessibilityDialog"
import { AppearanceToggle } from "@/components/AppearanceToggle"
import { NavUser } from "@/components/NavUser"
import { NotificationsSheet } from "@/components/NotificationsSheet"
import { RoleDeadlineChip } from "@/components/domain/RoleDeadlineBanner"
import { Button } from "@/components/ui/button"
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import type { BreadcrumbItem } from "@/types"

type AppSidebarHeaderProps = {
  breadcrumbs?: BreadcrumbItem[]
  pageTitle?: string
  sidebar?: boolean
}

export function AppSidebarHeader({ sidebar = true }: AppSidebarHeaderProps) {
  const { toggleSidebar } = useSidebar()

  return (
    <header className="sticky top-0 z-30 flex h-(--app-header-height) shrink-0 items-center gap-2 border-border bg-card px-4 pt-[env(safe-area-inset-top)] transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--app-header-compact-height) max-sm:fixed max-sm:scroll-lock-offset max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:h-(--mobile-nav-height) max-sm:justify-around max-sm:border-t max-sm:border-b-0 max-sm:pt-0 max-sm:pb-[env(safe-area-inset-bottom)] max-sm:shadow-menu">
      <div className="flex min-w-0 flex-1 items-center gap-2 max-sm:contents">
        {!sidebar ? (
          <div className="flex items-center max-sm:hidden" data-app-logo>
            <Image src="/logo-ueb-horizontal-claro.webp" width={600} height={164} unoptimized loading="eager" decoding="async" alt="Universidad Estatal de Bolívar" className="h-12 w-auto dark:hidden" />
            <Image src="/logo-ueb-horizontal.webp" width={600} height={164} unoptimized decoding="async" alt="" aria-hidden="true" className="hidden h-12 w-auto dark:block" />
          </div>
        ) : null}
        {sidebar ? <SidebarTrigger className="-ml-1 max-sm:hidden" /> : null}
        {sidebar ? (
          <Button type="button" variant="ghost" className="h-12 min-w-16 flex-col gap-0.5 px-3 order-3 sm:hidden" aria-label="Abrir el menú" onClick={toggleSidebar}>
            <Menu className="size-5" aria-hidden="true" />
            <span className="text-xs font-medium" aria-hidden="true">Menú</span>
          </Button>
        ) : null}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1 max-sm:contents sm:gap-2">
        <div className="max-sm:hidden"><RoleDeadlineChip /></div>
        <NotificationsSheet />
        <div className="max-sm:hidden"><AppearanceToggle /></div>
        <AccessibilityDialog remote />
        <NavUser />
      </div>
    </header>
  )
}
