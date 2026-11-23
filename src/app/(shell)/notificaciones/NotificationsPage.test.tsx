import { fireEvent, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { getNotifications, markAllNotificationsRead, markNotificationRead, type NotificationsResponse } from "@/api/notifications"
import NotificationsPage from "./NotificationsPage"
import { paths } from "@/lib/routes"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/notifications", () => ({
  getNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  openNotification: vi.fn(),
}))

const response = (unread: boolean): NotificationsResponse => ({
  filters: { status: "unread" },
  unread_count: unread ? 1 : 0,
  notifications: {
    data: [
      {
        id: "n1",
        tipo: "silabo.aprobado",
        titulo: "Sílabo aprobado",
        mensaje: "Su sílabo de Cálculo quedó aprobado.",
        leido_en: unread ? null : "2026-11-02T10:00:00Z",
        notificado_en: "2026-11-01T15:30:00Z",
        has_destination: false,
        context: "Software",
      },
    ],
    current_page: 1,
    last_page: 1,
    per_page: 20,
    from: 1,
    to: 1,
    total: 1,
  },
})

describe("Notificaciones", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    navigation.reset("/docente/notificaciones")
  })

  it("abre con las no leídas, sin el punto final del mensaje, y cambia a todas", async () => {
    vi.mocked(getNotifications).mockResolvedValue(response(true))
    renderWithProviders(<NotificationsPage />)
    await flush()

    expect(getNotifications).toHaveBeenCalledWith("unread", 1)
    expect(screen.getByRole("heading", { name: "Sílabo aprobado" })).toBeInTheDocument()
    expect(screen.getByText("Su sílabo de Cálculo quedó aprobado")).toBeInTheDocument()
    expect(screen.getByText("Nueva")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Todas" }))
    await flush()

    expect(getNotifications).toHaveBeenLastCalledWith("all", 1)
  })

  it("marca una como leída y todas como leídas, y vuelve a cargar", async () => {
    vi.mocked(getNotifications).mockResolvedValueOnce(response(true)).mockResolvedValue(response(false))
    vi.mocked(markNotificationRead).mockResolvedValue({ message: "ok" })
    vi.mocked(markAllNotificationsRead).mockResolvedValue({ message: "ok" })
    renderWithProviders(<NotificationsPage />)
    await flush()

    fireEvent.click(screen.getByRole("button", { name: "Marcar leída" }))
    await flush()
    expect(markNotificationRead).toHaveBeenCalledWith("n1")
    expect(getNotifications).toHaveBeenCalledTimes(2)
    expect(screen.queryByText("Nueva")).toBeNull()
    expect(screen.queryByRole("button", { name: "Marcar todas como leídas" })).toBeNull()
  })

  it("sin avisos lo dice", async () => {
    vi.mocked(getNotifications).mockResolvedValue({ ...response(false), unread_count: 0, notifications: { ...response(false).notifications, data: [], total: 0, from: null, to: null } })
    renderWithProviders(<NotificationsPage />)
    await flush()

    expect(screen.getByText("No existen notificaciones")).toBeInTheDocument()
  })

  it("si la sesión venció, vuelve a ingresar", async () => {
    vi.mocked(getNotifications).mockRejectedValue(new ApiError("Unauthenticated.", 401))
    renderWithProviders(<NotificationsPage />)
    await flush()

    expect(navigation.replace).toHaveBeenCalledWith(paths.login)
  })

  it("si no se pudo cargar, ofrece reintentar", async () => {
    vi.mocked(getNotifications).mockRejectedValueOnce(new ApiError("Error", 500)).mockResolvedValue(response(true))
    renderWithProviders(<NotificationsPage />)
    await flush()

    expect(screen.getByText("No se pudieron cargar las notificaciones")).toBeInTheDocument()
  })
})
