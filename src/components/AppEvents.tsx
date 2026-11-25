"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { initializeAccessibility } from "@/composables/useAccessibility"
import { initializeTheme } from "@/composables/useAppearance"
import { initializeDocumentPalette } from "@/lib/documentPalette"
import { installNativeValidation } from "@/lib/nativeValidation"
import { handleRoleRequired, handleUnauthorized } from "@/lib/unauthorized"
import { initializeInstallApp } from "@/state/installApp"
import "@/queries/sessionScope"
import "@/state/screenHelp"

export default function AppEvents() {
  const router = useRouter()

  useEffect(() => {
    initializeTheme()
    initializeAccessibility()
    initializeDocumentPalette()
    initializeInstallApp()

    return installNativeValidation()
  }, [])

  useEffect(() => {
    const onUnauthorized = (): void => handleUnauthorized(router)
    const onRoleRequired = (): void => handleRoleRequired(router)
    window.addEventListener("silabos:unauthorized", onUnauthorized)
    window.addEventListener("silabos:role-required", onRoleRequired)

    return () => {
      window.removeEventListener("silabos:unauthorized", onUnauthorized)
      window.removeEventListener("silabos:role-required", onRoleRequired)
    }
  }, [router])

  return null
}
