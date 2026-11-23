import { fireEvent, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { closeOtherDeviceSessions, getDeviceSessions, type DeviceSession } from "@/api/session"
import { OtherSessions } from "@/components/OtherSessions"
import { toast } from "@/lib/toast"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("@/api/session", () => ({ getDeviceSessions: vi.fn(), closeOtherDeviceSessions: vi.fn() }))
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const current: DeviceSession = { id: "s1", ip_address: "10.0.0.1", device: "Firefox en Linux", last_activity: "2026-11-03T15:00:00Z", current: true }
const phone: DeviceSession = { id: "s2", ip_address: "10.0.0.2", device: "Chrome en Android", last_activity: "2026-11-02T13:30:00Z", current: false }
const button = (label: string): HTMLButtonElement | undefined =>
  [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === label)

const submitPassword = async (password: string): Promise<void> => {
  fireEvent.click(button("Cerrar otras sesiones")!)
  await flush()
  fireEvent.change(document.body.querySelector<HTMLInputElement>("#other-sessions-password")!, { target: { value: password } })
  await flush()
  fireEvent.submit(document.body.querySelector<HTMLFormElement>('[role="dialog"] form')!)
  await flush()
}

describe("sesiones abiertas en Seguridad", () => {
  beforeEach(() => vi.resetAllMocks())

  it("lista los dispositivos, marca el actual y, sin otros, no ofrece cerrarlos", async () => {
    vi.mocked(getDeviceSessions).mockResolvedValue({ sessions: [current] })
    renderWithProviders(<OtherSessions />)
    await flush()

    expect(screen.getByText("Firefox en Linux")).toBeInTheDocument()
    expect(screen.getByText("Este dispositivo")).toBeInTheDocument()
    expect(button("Cerrar otras sesiones")).toBeUndefined()
  })

  it("cierra las otras sesiones con la contraseña y vuelve a cargar la lista", async () => {
    vi.mocked(getDeviceSessions).mockResolvedValueOnce({ sessions: [current, phone] }).mockResolvedValueOnce({ sessions: [current] })
    vi.mocked(closeOtherDeviceSessions).mockResolvedValue({ message: "Se cerró una sesión adicional.", closed_sessions: 1 })
    renderWithProviders(<OtherSessions />)
    await flush()
    expect(screen.getByText("Chrome en Android")).toBeInTheDocument()

    await submitPassword("Demo-2026!")

    expect(closeOtherDeviceSessions).toHaveBeenCalledWith("Demo-2026!")
    expect(toast.success).toHaveBeenCalledWith("Se cerró una sesión adicional.")
    await waitFor(() => expect(screen.queryByText("Chrome en Android")).toBeNull())
  })

  it("con la contraseña incorrecta muestra el error dentro del diálogo y no cierra nada", async () => {
    vi.mocked(getDeviceSessions).mockResolvedValue({ sessions: [current, phone] })
    vi.mocked(closeOtherDeviceSessions).mockRejectedValue(new ApiError("Datos inválidos", 422, { current_password: ["La contraseña no es correcta."] }))
    renderWithProviders(<OtherSessions />)
    await flush()

    await submitPassword("mala")

    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain("La contraseña no es correcta")
    expect(toast.success).not.toHaveBeenCalled()
  })
})
