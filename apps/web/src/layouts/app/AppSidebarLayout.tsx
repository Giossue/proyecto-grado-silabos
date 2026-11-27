"use client"

import { useMemo, useState, type ReactNode } from "react"
import { AccessibilityDialog } from "@/components/AccessibilityDialog"
import { AppContent } from "@/components/AppContent"
import { AppShell } from "@/components/AppShell"
import { AppSidebar } from "@/components/AppSidebar"
import { AppSidebarHeader } from "@/components/AppSidebarHeader"
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog"
import { RoleDeadlineBanner } from "@/components/domain/RoleDeadlineBanner"
import { ScreenHelpButton } from "@/components/domain/ScreenHelpButton"
import { SetupChecklist } from "@/components/domain/SetupChecklist"
import { ScrollArea } from "@/components/ui/scroll-area"
import { BreadcrumbsContext, PageTitleContext } from "@/composables/usePageBreadcrumbs"
import { useShowsSidebar } from "@/composables/useShowsSidebar"
import { useSignal } from "@/lib/signal"
import { curriculumEditorState } from "@/state/curriculumEditor"
import { templateEditorState } from "@/state/templateEditor"
import type { BreadcrumbItem } from "@/types"

const publishBannerHeight = (banner: HTMLDivElement | null) => {
  if (!banner) return
  const root = document.documentElement
  const observer = new ResizeObserver(() => root.style.setProperty("--app-banner-height", `${banner.offsetHeight}px`))
  observer.observe(banner)
  return () => {
    observer.disconnect()
    root.style.removeProperty("--app-banner-height")
  }
}

export function AppSidebarLayout({ breadcrumbs = [], children }: { breadcrumbs?: BreadcrumbItem[]; children: ReactNode }) {
  const [pageTitle, setPageTitle] = useState("")
  const pageTitleState = useMemo(() => ({ title: pageTitle, setTitle: setPageTitle }), [pageTitle])
  const showsSidebar = useShowsSidebar()
  const templateEditorOpen = useSignal(templateEditorState.open)
  const curriculumEditorOpen = useSignal(curriculumEditorState.open)
  const editorOpen = templateEditorOpen
  const sidebarVisible = showsSidebar && !curriculumEditorOpen

  return (
    <BreadcrumbsContext.Provider value={breadcrumbs}>
      <PageTitleContext.Provider value={pageTitleState}>
        <AppShell variant="sidebar" className="h-dvh min-h-0 max-sm:h-auto max-sm:min-h-dvh">
          {!editorOpen && sidebarVisible ? <AppSidebar /> : null}
          <AppContent variant="sidebar" className={editorOpen ? "min-h-0 overflow-clip" : "min-h-0 overflow-clip max-sm:overflow-visible max-sm:pb-(--mobile-nav-height)"}>
            {!editorOpen ? <AppSidebarHeader breadcrumbs={breadcrumbs} pageTitle={pageTitle} sidebar={sidebarVisible} /> : null}
            {!editorOpen ? (
              <div ref={publishBannerHeight} className="sticky top-0 z-20 shrink-0">
                <RoleDeadlineBanner />
              </div>
            ) : null}
            <ScrollArea data-app-scroll className="min-h-0 flex-1">
              {children}
            </ScrollArea>
            <ScreenHelpButton anchored editorMode={editorOpen} />
            {!editorOpen ? <SetupChecklist /> : null}
            {!editorOpen ? <AccessibilityDialog floating /> : null}
          </AppContent>
        </AppShell>
        <LogoutConfirmDialog />
      </PageTitleContext.Provider>
    </BreadcrumbsContext.Provider>
  )
}
