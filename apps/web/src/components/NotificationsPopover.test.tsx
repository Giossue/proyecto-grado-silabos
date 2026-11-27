import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getNotifications, openNotification, type Notification, type NotificationsResponse } from "@/api/notifications"
import { NotificationsPopover } from "@/components/NotificationsPopover"
import { sessionState } from "@/state/session"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/notifications", () => ({
  getNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  openNotification: vi.fn(),
}))

const load = vi.fn()

const administratorSession = {
  user: { id: "user-1", name: "Ada Admin", email: "ada@example.test", email_verified: true, can_edit_identity: true },
  active_role: { id: "role-1", code: "administrador" as const, career_id: null, career_name: null },
  available_roles: [{ id: "role-1", code: "administrador" as const, career_id: null, career_name: null }],
}

const notification = (overrides: Partial<Notification> = {}): Notification => ({
  id: "notification-1",
  tipo: "silabo.aprobado",
  titulo: "Sílabo aprobado",
  mensaje: "Coordinación aprobó el sílabo.",
  leido_en: null,
  notificado_en: new Date().toISOString(),
  has_destination: true,
  context: "Docente · Software",
  ...overrides,
})

const response = (data: Notification[], unread = 1): NotificationsResponse => ({
  filters: { status: "all" },
  unread_count: unread,
  notifications: { data, current_page: 1, last_page: 1, per_page: 20, from: data.length ? 1 : null, to: data.length ? data.length : null, total: data.length },
})

const bell = (): HTMLElement => document.querySelector<HTMLElement>('button[aria-haspopup="dialog"]')!

const mountOpen = async (user: ReturnType<typeof userEvent.setup>) => {
  const view = renderWithProviders(<NotificationsPopover />)
  await flush()
  await user.click(bell())
  await flush()
  return view
}

describe("NotificationsPopover", () => {
  beforeEach(() => {
    navigation.reset("/rol")
    load.mockReset()
    vi.mocked(openNotification).mockReset()
    vi.mocked(getNotifications).mockReset().mockResolvedValue(response([notification()]))
    sessionState.replace(null)
    vi.spyOn(sessionState, "load").mockImplementation(load)
  })

  const sessionWith = (...codes: ("administrador" | "docente" | "coordinador" | "bibliotecario")[]) => {
    const roles = codes.map((code, index) => ({ id: `role-${index}`, code, career_id: null, career_name: null }))
    return { user: administratorSession.user, active_role: roles[0]!, available_roles: roles }
  }

  it.each([["coordinador"], ["bibliotecario"], ["bibliotecario", "coordinador"]] as const)("no muestra la campana a quien solo revisa: %s", async (...codes) => {
    sessionState.replace(sessionWith(...(codes.filter(Boolean) as Parameters<typeof sessionWith>)))
    renderWithProviders(<NotificationsPopover />)
    await flush()

    expect(bell()).toBeNull()
    expect(getNotifications).not.toHaveBeenCalled()
  })

  it.each([["coordinador", "docente"], ["bibliotecario", "administrador"]] as const)("conserva la campana a un %s que además es %s", async (active, other) => {
    sessionState.replace(sessionWith(active, other))
    renderWithProviders(<NotificationsPopover />)
    await flush()

    expect(bell()).not.toBeNull()
  })

  it("abre un panel desplegable anclado a la campana, sin oscurecer ni bloquear la página", async () => {
    const user = userEvent.setup()
    await mountOpen(user)

    const panel = screen.getByRole("dialog", { name: "Notificaciones" })
    expect(panel).toHaveAttribute("data-slot", "popover-content")
    expect(document.querySelector('[data-slot$="-overlay"]')).toBeNull()
    expect(document.body).not.toHaveAttribute("data-scroll-locked")
    expect(bell()).toHaveAttribute("aria-expanded", "true")
  })

  it("al abrir deja el foco en el panel, no sobre «Marcar todas como leídas»", async () => {
    const user = userEvent.setup()
    await mountOpen(user)

    expect(screen.getByRole("dialog", { name: "Notificaciones" })).toHaveFocus()
  })

  it("tiene un botón visible para cerrar, que devuelve el foco a la campana", async () => {
    const user = userEvent.setup()
    await mountOpen(user)

    await user.click(screen.getByRole("button", { name: "Cerrar notificaciones" }))
    await flush()

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(bell()).toHaveFocus()
  })

  it("se cierra con Escape o al pulsar otra vez la campana", async () => {
    const user = userEvent.setup()
    await mountOpen(user)
    await user.keyboard("{Escape}")
    await flush()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(bell()).toHaveAttribute("aria-expanded", "false")

    await user.click(bell())
    await flush()
    await user.click(bell())
    await flush()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("en pantallas angostas y con ámbito elegido la campana lleva a la página, sin abrir el panel", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ matches: query === "(width < 40rem)", media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) as unknown as MediaQueryList)
    sessionState.replace(administratorSession)
    const user = userEvent.setup()
    await mountOpen(user)

    expect(navigation.push).toHaveBeenCalledWith("/admin/notificaciones")
    expect(screen.queryByRole("dialog")).toBeNull()
    // Solo el contador de la campana consulta al servidor.
    expect(getNotifications).toHaveBeenCalledTimes(1)
  })

  it("mantiene el filtro visible mientras carga los avisos y reemplaza la carga al recibirlos", async () => {
    const payload = response([notification()])
    let finish!: (value: NotificationsResponse) => void
    vi.mocked(getNotifications).mockResolvedValueOnce(payload).mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const user = userEvent.setup()
    await mountOpen(user)

    expect(screen.getByLabelText("Cargando notificaciones")).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-label", "Filtrar notificaciones")

    finish(payload)
    await flush()

    expect(screen.queryByLabelText("Cargando notificaciones")).toBeNull()
    expect(document.body.textContent).toContain("Sílabo aprobado")
  })

  it("al reabrir muestra la carga en vez de los avisos anteriores", async () => {
    const user = userEvent.setup()
    await mountOpen(user)
    expect(document.body.textContent).toContain("Sílabo aprobado")
    await user.click(screen.getByRole("button", { name: "Cerrar notificaciones" }))
    await flush()

    vi.mocked(getNotifications).mockReturnValueOnce(new Promise(() => undefined))
    await user.click(bell())
    await flush()

    expect(screen.getByLabelText("Cargando notificaciones")).toBeInTheDocument()
    expect(document.body.textContent).not.toContain("Sílabo aprobado")
  })

  it("abre siempre en «No leídas»", async () => {
    const user = userEvent.setup()
    await mountOpen(user)

    expect(getNotifications).toHaveBeenLastCalledWith("unread")
    await user.click(screen.getByRole("radio", { name: "Todas" }))
    await flush()
    expect(getNotifications).toHaveBeenLastCalledWith("all")

    await user.click(screen.getByRole("button", { name: "Cerrar notificaciones" }))
    await flush()
    await user.click(bell())
    await flush()
    expect(getNotifications).toHaveBeenLastCalledWith("unread")
    expect(screen.getByRole("radio", { name: "No leídas" })).toHaveAttribute("aria-checked", "true")
  })

  it("sin avisos aclara que solo cuenta el período en curso", async () => {
    vi.mocked(getNotifications).mockResolvedValue(response([], 0))
    const user = userEvent.setup()
    await mountOpen(user)

    expect(document.body.textContent).toContain("No tiene notificaciones sin leer en este período")
    expect(document.querySelector('[data-slot="empty"]')!.closest('[data-slot="card"]')).toBeNull()
  })

  it("sin ámbito elegido muestra el contexto y no ofrece la página completa", async () => {
    const user = userEvent.setup()
    await mountOpen(user)

    expect(document.body.textContent).toContain("Docente · Software")
    expect(document.body.textContent).not.toContain("Ver todas las notificaciones")
  })

  it("abre el aviso por el servidor y navega solo después de actualizar la sesión (I-121)", async () => {
    vi.mocked(openNotification).mockResolvedValue({ path: "/docente/mis-silabos/s-1", role_changed: true })
    const user = userEvent.setup()
    await mountOpen(user)

    await user.click(document.body.querySelector<HTMLElement>("li button")!)
    await flush()

    expect(openNotification).toHaveBeenCalledWith("notification-1")
    expect(load).toHaveBeenCalledWith(true)
    expect(navigation.push).toHaveBeenCalledWith("/docente/mis-silabos/s-1")
    expect(load.mock.invocationCallOrder[0]).toBeLessThan(navigation.push.mock.invocationCallOrder[0])
  })

  it("la campana queda marcada en la lista de avisos, no en la pestaña «Notificaciones» de Configuración", async () => {
    const variantAt = async (path: string): Promise<string | null> => {
      navigation.reset(path)
      const view = renderWithProviders(<NotificationsPopover />)
      await flush()
      const variant = bell().getAttribute("data-variant")
      view.unmount()
      return variant
    }

    expect(await variantAt("/docente/notificaciones")).toBe("secondary")
    expect(await variantAt("/docente/configuracion/notificaciones")).toBe("ghost")
  })
})
