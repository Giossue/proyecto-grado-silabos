"use client"

import { useMemo, useState, type ReactNode } from "react"
import { AccessibilityDialog } from "@/components/AccessibilityDialog"
import { AppContent } from "@/components/AppContent"
import { AppShell } from "@/components/AppShell"
import { AppSidebar } from "@/components/AppSidebar"
import { AppSidebarHeader } from "@/components/AppSidebarHeader"
import { InstallAppDialog } from "@/components/InstallAppDialog"
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog"
import { RoleDeadlineBanner } from "@/components/domain/RoleDeadlineBanner"
import { ScreenHelpButton } from "@/components/domain/ScreenHelpButton"
import { SetupChecklist } from "@/components/domain/SetupChecklist"
import { SetupNextStepBanner } from "@/components/domain/SetupNextStepBanner"
import { ScrollArea } from "@/components/ui/scroll-area"
import { BreadcrumbsContext, PageTitleContext } from "@/composables/usePageBreadcrumbs"
import { useShowsSidebar } from "@/composables/useShowsSidebar"
import { useSignal } from "@/lib/signal"
import { curriculumEditorState } from "@/state/curriculumEditor"
import { installAppOpen } from "@/state/shellDialogs"
import { templateEditorState } from "@/state/templateEditor"
import type { BreadcrumbItem } from "@/types"

export function AppSidebarLayout({ breadcrumbs = [], children }: { breadcrumbs?: BreadcrumbItem[]; children: ReactNode }) {
  const [pageTitle, setPageTitle] = useState("")
  const pageTitleState = useMemo(() => ({ title: pageTitle, setTitle: setPageTitle }), [pageTitle])
  const showsSidebar = useShowsSidebar()
  const templateEditorOpen = useSignal(templateEditorState.open)
  const curriculumEditorOpen = useSignal(curriculumEditorState.open)
  const installOpen = useSignal(installAppOpen)
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
              <div className="sticky top-0 z-20 shrink-0">
                <SetupNextStepBanner />
                <RoleDeadlineBanner />
              </div>
            ) : null}
            <ScrollArea data-app-scroll className="min-h-0 flex-1">
              {children}
            </ScrollArea>
            <ScreenHelpButton editorMode={editorOpen} corner={templateEditorOpen ? "left" : "right"} />
            {!editorOpen ? <SetupChecklist /> : null}
            {!editorOpen ? <AccessibilityDialog floating /> : null}
          </AppContent>
        </AppShell>
        {!showsSidebar ? <InstallAppDialog open={installOpen} onOpenChange={(value) => { installAppOpen.value = value }} /> : null}
        <LogoutConfirmDialog />
      </PageTitleContext.Provider>
    </BreadcrumbsContext.Provider>
  )
}
