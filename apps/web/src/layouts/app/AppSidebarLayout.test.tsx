import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { initializeTheme } from "@/composables/useAppearance"
import { AppSidebarLayout } from "@/layouts/app/AppSidebarLayout"
import { curriculumEditorState } from "@/state/curriculumEditor"
import { sessionState } from "@/state/session"
import { logoutConfirmOpen } from "@/state/shellDialogs"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"

const { getDeadline, getDashboard, getNotifications, leaveActiveRole, logout, selectActiveRole, updateAccessibility } = vi.hoisted(() => ({
  getDeadline: vi.fn(),
  getDashboard: vi.fn(),
  getNotifications: vi.fn(),
  leaveActiveRole: vi.fn(),
  logout: vi.fn(),
  selectActiveRole: vi.fn(),
  updateAccessibility: vi.fn(),
}))

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/notifications", () => ({ getNotifications, markAllNotificationsRead: vi.fn(), markNotificationRead: vi.fn(), openNotification: vi.fn() }))
vi.mock("@/api/dashboard", () => ({ getDeadline, getDashboard }))
vi.mock("@/api/screen-help", () => ({ listAvailableScreenHelp: vi.fn().mockResolvedValue({ help: [] }) }))
vi.mock("@/api/session", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/api/session")>(),
  leaveActiveRole,
  logout,
  selectActiveRole,
  updateAccessibility,
}))

const administratorSession = {
  user: { id: "user-1", name: "Ada Admin", email: "ada@example.test", email_verified: true, can_edit_identity: true },
  active_role: { id: "role-1", code: "administrador" as const, career_id: null, career_name: null },
  available_roles: [
    { id: "role-1", code: "administrador" as const, career_id: null, career_name: null },
    { id: "role-2", code: "coordinador" as const, career_id: "career-1", career_name: "Software" },
  ],
}

const mountShell = async () => {
  const view = renderWithProviders(<AppSidebarLayout><p>Contenido</p></AppSidebarLayout>)
  await flush()
  return view
}

const userMenuButton = (): HTMLElement => document.querySelector<HTMLElement>('header [data-user-menu]')!

const openUserMenu = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  await user.click(userMenuButton())
  await flush()
}

describe("AppSidebarLayout", () => {
  beforeEach(() => {
    localStorage.clear()
    initializeTheme()
    navigation.reset("/admin/convocatorias")
    sessionState.replace(administratorSession)
    getDeadline.mockResolvedValue({ deadline: null })
    getDashboard.mockResolvedValue({ metrics: [], setup: null, deadline: null, coordination_convocation: null })
    getNotifications.mockResolvedValue({ unread_count: 3, filters: { status: "unread" }, notifications: { data: [], current_page: 1, last_page: 1, total: 0 } })
    logout.mockResolvedValue(undefined)
    updateAccessibility.mockResolvedValue({})
  })

  afterEach(() => {
    act(() => {
      curriculumEditorState.setOpen(false)
      logoutConfirmOpen.value = false
    })
    sessionState.clear()
  })

  it("muestra el aviso de plazo bajo la barra superior en cualquier pantalla del coordinador, y no a Administración", async () => {
    getDeadline.mockResolvedValue({ deadline: { period: "2026-2027", starts_at: "2026-10-26", due_at: "2026-10-30", state: "active", days_until_start: 0, days_until_due: 3, convocation_id: "c1", paused_by: null, classes_ended: false, career_pending: false } })
    act(() => sessionState.replace({ ...administratorSession, active_role: { id: "role-2", code: "coordinador", career_id: "career-1", career_name: "Software" } }))
    await mountShell()

    const banner = (await screen.findByText(/Quedan 3 días/)).closest<HTMLElement>('[role="status"]')!
    expect(banner.textContent).toBe("Quedan 3 días para recibir y revisar los sílabos de su carreraHasta el 30 de octubre de 2026")
    expect(banner.compareDocumentPosition(document.querySelector("header")!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    const calls = getDeadline.mock.calls.length

    getDeadline.mockResolvedValue({ deadline: null })
    act(() => sessionState.replace(administratorSession))
    await flush()
    expect(document.body.textContent).not.toContain("Quedan 3 días")
    expect(getDeadline).toHaveBeenCalledTimes(calls + 1)
  })

  it("muestra la navegación del rol y el indicador de notificaciones sin leer", async () => {
    await mountShell()

    expect(document.body.textContent).toContain("Usuarios")
    const sidebar = document.querySelector<HTMLElement>('[data-sidebar="sidebar"]')!
    expect(sidebar.textContent).not.toContain("Panel")
    expect(sidebar.querySelector('[data-sidebar="header"] img')?.getAttribute("src")).toContain("logo-ueb-horizontal")
    const current = sidebar.querySelector('a[href="/admin/convocatorias"]')!
    expect(current.getAttribute("data-active")).toBe("true")
    expect(current.getAttribute("aria-current")).toBe("page")
    expect(sidebar.textContent).not.toContain("Configuración")
    expect(sidebar.querySelector('[aria-label="Rol y carrera activos"]')).toBeNull()
    expect(sidebar.querySelector('[data-user-menu]')).toBeNull()
    expect(userMenuButton().textContent).toContain("Ada Admin")
    expect(document.body.textContent).not.toContain("Mis sílabos")
    expect(document.querySelector('[aria-label="Asistente curricular"]')).toBeNull()
    const notificationsButton = await screen.findByRole("button", { name: "Notificaciones sin leer" })
    expect(notificationsButton.querySelector('[data-slot="badge"]')?.textContent).toBe("")
  })

  it("no muestra Panel a Coordinación: entra a Revisión", async () => {
    sessionState.replace({ ...administratorSession, active_role: { id: "role-coordinador", code: "coordinador", career_id: "career-1", career_name: "Software" } })
    await mountShell()

    const sidebar = document.querySelector<HTMLElement>('[data-sidebar="sidebar"]')!
    expect([...sidebar.querySelectorAll('[data-sidebar="content"] a')].map((link) => link.textContent)).toEqual(["Revisión", "Materias y asignaciones", "Docentes", "Proyecto de carrera", "Malla"])
    expect(sidebar.textContent).not.toContain("Antes de empezar")
    expect(sidebar.textContent).not.toContain("Fuentes académicas")
    expect(sidebar.querySelector('a[href="/coordinacion/fuentes"]')).toBeNull()
    expect(sidebar.querySelector('a[href="/coordinacion/proyecto-carrera"]')).not.toBeNull()
    expect(document.querySelector('[aria-label="Asistente curricular"]')).toBeNull()
  })

  it("a Biblioteca no le muestra menú lateral y pone el logo en el encabezado", async () => {
    sessionState.replace({ ...administratorSession, active_role: { id: "role-bibliotecario", code: "bibliotecario", career_id: null, career_name: null } })
    await mountShell()

    expect(document.querySelector('[data-sidebar="sidebar"]')).toBeNull()
    expect(document.querySelector('[data-sidebar="trigger"]')).toBeNull()
    expect(document.querySelector("header [data-app-logo] img")).not.toBeNull()
    expect(document.querySelector("header [data-app-logo]")!.closest("a")).toBeNull()
    expect(document.querySelector('header [aria-label="Ir al inicio"]')).toBeNull()
    expect(userMenuButton().textContent).not.toContain("Bibliotecario")
  })

  it("al docente no le muestra menú lateral y le deja cambiar de rol desde el menú de usuario", async () => {
    sessionState.replace({ ...administratorSession, active_role: { id: "role-docente", code: "docente", career_id: "career-1", career_name: "Software" } })
    const user = userEvent.setup()
    await mountShell()

    expect(document.querySelector('[data-sidebar="sidebar"]')).toBeNull()
    expect(document.querySelector("header [data-app-logo] img")).not.toBeNull()
    expect(document.querySelector("header [data-app-logo]")!.closest("a")).toBeNull()
    expect(document.querySelector('header [aria-label="Ir al inicio"]')).toBeNull()
    expect(document.querySelector('header [role="progressbar"]')).toBeNull()

    await openUserMenu(user)
    leaveActiveRole.mockResolvedValue({ ...administratorSession, active_role: null })
    await user.click(document.body.querySelector<HTMLElement>('[data-test="switch-scope"]')!)
    await flush()

    expect(leaveActiveRole).toHaveBeenCalled()
    expect(navigation.pathname).toBe("/rol")
    expect(sessionState.current.value?.active_role).toBeNull()
  })

  it("permite alternar el tema y conserva la preferencia", async () => {
    const user = userEvent.setup()
    await mountShell()
    await user.click(screen.getByRole("button", { name: "Tema visual: Claro. Cambiar a Oscuro" }))

    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(localStorage.getItem("appearance")).toBe("dark")
  })

  it("oculta el sidebar pero deja el encabezado global durante la edición de malla", async () => {
    await mountShell()
    expect(document.querySelector('[data-sidebar="sidebar"]')).not.toBeNull()
    expect(document.querySelector('[data-sidebar="trigger"]')).not.toBeNull()

    act(() => curriculumEditorState.setOpen(true))
    expect(document.querySelector('[data-sidebar="sidebar"]')).toBeNull()
    expect(document.querySelector('[data-sidebar="trigger"]')).toBeNull()
    expect(userMenuButton()).not.toBeNull()
    expect(document.querySelector("header [data-app-logo]")).not.toBeNull()
    expect(document.body.textContent).toContain("Contenido")

    act(() => curriculumEditorState.setOpen(false))
    expect(document.querySelector('[data-sidebar="sidebar"]')).not.toBeNull()
    expect(document.querySelector('[data-sidebar="trigger"]')).not.toBeNull()
  })

  it("expone el cambio de ámbito desde el menú de usuario y no desde el menú lateral", async () => {
    const user = userEvent.setup()
    await mountShell()
    await openUserMenu(user)
    expect(document.body.textContent).toContain("Cerrar sesión")

    const logoutItem = document.body.querySelector<HTMLElement>('[data-test="logout-button"]')
    expect(logoutItem?.classList.contains("block")).toBe(false)
    expect(logoutItem?.classList.contains("flex")).toBe(true)
    expect(document.querySelector('[data-sidebar="sidebar"] [data-test="switch-scope"]')).toBeNull()

    leaveActiveRole.mockResolvedValue({ ...administratorSession, active_role: null })
    await user.click(document.body.querySelector<HTMLElement>('[data-test="switch-scope"]')!)
    await flush()

    expect(navigation.pathname).toBe("/rol")
  })

  it("no presenta Administración cuando todavía no hay un rol activo", async () => {
    sessionState.replace({ ...administratorSession, active_role: null })
    const user = userEvent.setup()
    await mountShell()
    await openUserMenu(user)

    expect(document.body.querySelector('[data-test="switch-scope"]')).toBeNull()
    expect(userMenuButton().textContent).not.toContain("Administrador")
  })

  it("pide confirmación antes de cerrar sesión y no sale si se cancela", async () => {
    logout.mockClear()
    const user = userEvent.setup()
    await mountShell()
    const openLogout = async (): Promise<void> => {
      await openUserMenu(user)
      await user.click(document.body.querySelector<HTMLElement>('[data-test="logout-button"]')!)
      await flush()
    }
    const dialog = (): HTMLElement | null => document.body.querySelector<HTMLElement>('[role="dialog"]')
    const button = (name: string): HTMLButtonElement | undefined =>
      [...dialog()!.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === name)

    await openLogout()
    expect(dialog()?.textContent).toContain("¿Cerrar sesión?")
    expect(logout).not.toHaveBeenCalled()

    await user.click(button("Cancelar")!)
    await waitFor(() => expect(dialog()).toBeNull())
    expect(logout).not.toHaveBeenCalled()
    expect(navigation.pathname).toBe("/admin/convocatorias")

    await openLogout()
    await user.click(button("Cerrar sesión")!)
    await flush()
    expect(logout).toHaveBeenCalledTimes(1)
    expect(sessionState.current.value).toBeNull()
    expect(navigation.pathname).toBe("/ingresar")
  })
})
