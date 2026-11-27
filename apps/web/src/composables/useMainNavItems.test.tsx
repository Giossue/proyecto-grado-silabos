import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "@/api/session"
import { NavMain } from "@/components/NavMain"
import { SidebarProvider } from "@/components/ui/sidebar"
import { mainNavItemsFor } from "@/composables/useMainNavItems"
import { navigation } from "@/test/nextNavigation"
import { renderWithProviders } from "@/test/render"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))

const administrator = { active_role: { code: "administrador" } } as unknown as Session

describe("menú lateral de Administración", () => {
  beforeEach(() => navigation.reset("/admin/periodos"))

  it.each([
    "/admin/carreras/sw/malla",
    "/admin/carreras/sw/proyecto-carrera/sw-9/sw-101",
    "/admin/estructura-academica/carreras",
  ])("en %s resalta solo «Facultades y carreras»", (path) => {
    navigation.reset(path)
    renderWithProviders(<SidebarProvider><NavMain items={mainNavItemsFor(administrator)} /></SidebarProvider>)

    const active = [...document.querySelectorAll('[data-active="true"]')].map((item) => item.textContent)
    expect(active).toEqual(["Facultades y carreras"])
    expect(screen.getByRole("link", { name: "Facultades y carreras" }).getAttribute("href")).toBe("/admin/estructura-academica")
  })
})
