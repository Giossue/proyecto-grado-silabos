"use client"

import Image from "next/image"
import { useMemo, useState, type ReactNode } from "react"
import { AppearanceToggle } from "@/components/AppearanceToggle"
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog"
import { NotificationsSheet } from "@/components/NotificationsSheet"
import { UserMenuContent } from "@/components/UserMenuContent"
import { MenuTooltip } from "@/components/domain/MenuTooltip"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { getInitials } from "@/composables/useInitials"
import { PageTitleContext } from "@/composables/usePageBreadcrumbs"
import { sessionUser } from "@/lib/sessionUser"
import { useSession } from "@/state/session"

export function WorkspaceLayout({ children }: { children: ReactNode }) {
  const [pageTitle, setPageTitle] = useState("")
  const pageTitleState = useMemo(() => ({ title: pageTitle, setTitle: setPageTitle }), [pageTitle])
  const user = sessionUser(useSession().session)

  return (
    <PageTitleContext.Provider value={pageTitleState}>
      <div className="flex min-h-svh w-full flex-col bg-background">
        <header className="sticky top-0 z-30 flex h-(--app-header-height) shrink-0 items-center gap-3 border-b border-sidebar-border/70 bg-background px-4 pt-[env(safe-area-inset-top)] md:px-6">
          <div className="flex items-center gap-2">
            <Image src="/logo-ueb-horizontal-claro.webp" width={600} height={164} unoptimized decoding="async" alt="Universidad Estatal de Bolívar" className="h-12 w-auto dark:hidden" />
            <Image src="/logo-ueb-horizontal.webp" width={600} height={164} unoptimized decoding="async" alt="" aria-hidden="true" className="hidden h-12 w-auto dark:block" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <NotificationsSheet />
            <AppearanceToggle />
            <MenuTooltip label="Menú de usuario">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="rounded-full" aria-label="Menú de usuario">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">
                        {getInitials(user.nombre)}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <UserMenuContent user={user} />
                </DropdownMenuContent>
              </DropdownMenu>
            </MenuTooltip>
          </div>
        </header>
        <main id="contenido" tabIndex={-1} className="flex flex-1 flex-col p-4 outline-hidden md:p-6">
          {children}
        </main>
      </div>
      <LogoutConfirmDialog />
    </PageTitleContext.Provider>
  )
}
