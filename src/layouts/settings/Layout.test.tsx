import { act, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SettingsLayout } from "@/layouts/settings/Layout"
import { paths } from "@/lib/routes"
import { sessionState } from "@/state/session"
import { settingsReturn, trackSettingsReturn } from "@/state/settingsReturn"
import { navigation } from "@/test/nextNavigation"
import { renderWithProviders } from "@/test/render"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))

const coordinatorSession = {
  user: { id: "u1", name: "Ana", email: "ana@ueb.edu.ec", email_verified: true, can_edit_identity: false },
  active_role: { id: "r1", code: "coordinador" as const, career_id: "c1", career_name: "Software" },
  available_roles: [],
}

let previous: string | null = null
const visit = (href: string): void => {
  act(() => navigation.push(href))
  trackSettingsReturn(href, previous)
  previous = href
}

const tabs = (): HTMLElement => screen.getByRole("navigation", { name: "Configuración" })

describe("Configuración: Volver", () => {
  beforeEach(() => {
    previous = null
    settingsReturn.value = null
    navigation.reset("/")
    sessionState.replace(coordinatorSession)
  })
  afterEach(() => sessionState.clear())

  it("lleva a donde estaba antes de entrar, aunque se haya cambiado entre Perfil y Seguridad", async () => {
    visit("/coordinacion/proyecto-carrera")
    visit(paths.coordination.profile)
    visit(paths.coordination.security)
    const user = userEvent.setup()
    renderWithProviders(<SettingsLayout><p>Contenido</p></SettingsLayout>)

    await user.click(screen.getByRole("button", { name: "Volver" }))

    expect(navigation.fullPath).toBe("/coordinacion/proyecto-carrera")
  })

  it("si se abrió Configuración directo, lleva al inicio del rol", async () => {
    visit(paths.coordination.security)
    const user = userEvent.setup()
    renderWithProviders(<SettingsLayout><p>Contenido</p></SettingsLayout>)

    await user.click(screen.getByRole("button", { name: "Volver" }))

    expect(navigation.fullPath).toBe(paths.coordination.reviews)
  })

  it("solo Administración tiene la pestaña «Sistema»", () => {
    visit(paths.coordination.security)
    const coordinator = renderWithProviders(<SettingsLayout><p>Contenido</p></SettingsLayout>)
    expect(tabs().textContent).not.toContain("Sistema")
    coordinator.unmount()

    visit(paths.admin.security)
    renderWithProviders(<SettingsLayout><p>Contenido</p></SettingsLayout>)
    expect(screen.getByRole("link", { name: "Sistema" })).toHaveAttribute("href", "/admin/configuracion/sistema")
  })

  it("Coordinación, Docente y Biblioteca tienen la pestaña «Notificaciones»; Administración no", () => {
    visit(paths.coordination.security)
    const coordinator = renderWithProviders(<SettingsLayout><p>Contenido</p></SettingsLayout>)
    expect(screen.getByRole("link", { name: "Notificaciones" })).toHaveAttribute("href", "/coordinacion/configuracion/notificaciones")
    coordinator.unmount()

    visit(paths.admin.security)
    renderWithProviders(<SettingsLayout><p>Contenido</p></SettingsLayout>)
    expect(tabs().textContent).not.toContain("Notificaciones")
  })

  it("marca la pestaña de la pantalla actual", () => {
    visit(paths.coordination.security)
    renderWithProviders(<SettingsLayout><p>Contenido</p></SettingsLayout>)

    expect(screen.getByRole("link", { name: "Seguridad" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Perfil" })).not.toHaveAttribute("aria-current")
  })
})

describe("Configuración: carga", () => {
  beforeEach(() => {
    navigation.reset(paths.coordination.security)
    sessionState.replace(coordinatorSession)
  })
  afterEach(() => sessionState.clear())

  it("mientras carga, el ícono, el título y el subtítulo también son esqueleto", () => {
    const view = renderWithProviders(<SettingsLayout loading><p>Contenido</p></SettingsLayout>)

    expect(document.querySelector('[data-skeleton="page-icon"]')).not.toBeNull()
    expect(document.querySelector('[data-skeleton="page-title"]')).not.toBeNull()
    expect(document.querySelector('[data-skeleton="page-description"]')).not.toBeNull()
    expect(document.body.textContent).not.toContain("Administre su perfil")

    view.rerender(<SettingsLayout loading={false}><p>Contenido</p></SettingsLayout>)
    expect(document.querySelector('[data-skeleton="page-title"]')).toBeNull()
    expect(document.body.textContent).toContain("Administre su perfil y seguridad")
  })
})
