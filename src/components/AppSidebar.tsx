"use client"

import { Download } from "lucide-react"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { InstallAppDialog } from "@/components/InstallAppDialog"
import { NavFooter } from "@/components/NavFooter"
import { NavMain } from "@/components/NavMain"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useCurrentFullPath } from "@/composables/useCurrentUrl"
import { useMainNavItems } from "@/composables/useMainNavItems"
import { useInstallApp } from "@/state/installApp"
import type { NavItem } from "@/types"

const footerNavItems: NavItem[] = []

export function AppSidebar() {
  const fullPath = useCurrentFullPath()
  const mainNavItems = useMainNavItems()
  const { isMobile, setOpenMobile } = useSidebar()
  const [installOpen, setInstallOpen] = useState(false)
  const { installed } = useInstallApp()
  const previousPath = useRef(fullPath)

  useEffect(() => {
    if (previousPath.current === fullPath) return
    previousPath.current = fullPath
    if (isMobile) setOpenMobile(false)
  }, [fullPath, isMobile, setOpenMobile])

  return (
    <>
      <Sidebar collapsible="icon" variant="sidebar" className="border-sidebar">
        <SidebarHeader>
          <div className="flex min-h-16 items-center p-2 transition-[padding] duration-200 ease-linear group-data-[collapsible=icon]:h-12 group-data-[collapsible=icon]:min-h-12 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
            <Image src="/logo-ueb-horizontal.webp" width={600} height={164} unoptimized decoding="async" alt="Universidad Estatal de Bolívar" className="h-auto w-full group-data-[collapsible=icon]:hidden" />
            <Image src="/logo-ueb-sidebar.png" width={36} height={37} unoptimized decoding="async" alt="Universidad Estatal de Bolívar" className="hidden size-7 object-contain group-data-[collapsible=icon]:block" />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <NavMain items={mainNavItems} />
        </SidebarContent>
        <SidebarFooter>
          <NavFooter items={footerNavItems} />
          {isMobile && !installed ? (
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton data-test="install-app" tooltip="Instalar aplicación" onClick={() => setInstallOpen(true)}>
                  <Download aria-hidden="true" />
                  <span>Instalar aplicación</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          ) : null}
        </SidebarFooter>
      </Sidebar>
      <InstallAppDialog open={installOpen} onOpenChange={setInstallOpen} />
    </>
  )
}
