import { fireEvent, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { getTwoFactorStatus, requestPasswordRecovery, updatePassword, type Session } from "@/api/session"
import SecurityPage from "./SecurityPage"
import { toast } from "@/lib/toast"
import { sessionState } from "@/state/session"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/session", () => ({
  getTwoFactorStatus: vi.fn(),
  updatePassword: vi.fn(),
  requestPasswordRecovery: vi.fn(),
  confirmTwoFactor: vi.fn(),
  disableTwoFactor: vi.fn(),
  enableTwoFactor: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
  getDeviceSessions: vi.fn(),
  closeOtherDeviceSessions: vi.fn(),
}))
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/layouts/settings/Layout", () => ({ SettingsLayout: ({ children }: { children?: ReactNode }) => <div>{children}</div> }))

const session: Session = {
  user: { id: "u1", name: "Ana", email: "ana@ueb.edu.ec", email_verified: true, can_edit_identity: false },
  active_role: { id: "r1", code: "docente", career_id: "c1", career_name: "Software" },
  available_roles: [],
}
const pageButton = (text: string): HTMLButtonElement =>
  [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((button) => !button.closest('[role="dialog"]') && button.textContent?.includes(text))!
const dialogButton = (text: string): HTMLButtonElement =>
  [...document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((button) => button.textContent?.trim() === text)!
const dialog = (): HTMLElement | null => document.body.querySelector('[role="dialog"]')

const renderPage = async (): Promise<void> => {
  renderWithProviders(<SecurityPage />)
  await flush()
}

describe("Seguridad: restablecer la contraseña por correo", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    sessionState.replace(session)
    vi.mocked(getTwoFactorStatus).mockResolvedValue({ enabled: false, confirmation_required: false })
  })
  afterEach(() => sessionState.clear())

  it("envía el enlace al correo de la cuenta y avisa que se cerrará la sesión en todos lados", async () => {
    vi.mocked(requestPasswordRecovery).mockResolvedValue({ message: "ok" })
    await renderPage()

    expect(document.body.textContent).toContain("ana@ueb.edu.ec")
    expect(document.body.textContent).toContain("se cerrará la sesión en todos los dispositivos")
    fireEvent.click(pageButton("Enviar enlace"))
    await flush()

    expect(requestPasswordRecovery).not.toHaveBeenCalled()
    expect(dialog()?.textContent).toContain("se cerrará la sesión en todos los dispositivos")
    fireEvent.click(dialogButton("Enviar enlace"))
    await flush()

    expect(requestPasswordRecovery).toHaveBeenCalledWith("ana@ueb.edu.ec")
    expect(dialog()).toBeNull()
    expect(toast.success).toHaveBeenCalledWith("Enlace enviado. Revise su correo")
    expect(document.body.textContent).not.toContain("Enlace enviado")
  })

  it("«Cancelar» cierra la confirmación sin enviar nada", async () => {
    await renderPage()

    fireEvent.click(pageButton("Enviar enlace"))
    await flush()
    fireEvent.click(dialogButton("Cancelar"))
    await flush()

    expect(requestPasswordRecovery).not.toHaveBeenCalled()
    expect(dialog()).toBeNull()
  })

  it("con el tope de envíos alcanzado lo explica en español", async () => {
    vi.mocked(requestPasswordRecovery).mockRejectedValue(new ApiError("Too Many Attempts.", 429, {}))
    await renderPage()

    fireEvent.click(pageButton("Enviar enlace"))
    await flush()
    fireEvent.click(dialogButton("Enviar enlace"))
    await flush()

    expect(dialog()?.textContent).toContain("Se alcanzó el máximo de envíos")
  })

  it("muestra el error si no se pudo enviar", async () => {
    vi.mocked(requestPasswordRecovery).mockRejectedValue(new ApiError("Servicio de correo no disponible", 503, {}))
    await renderPage()

    fireEvent.click(pageButton("Enviar enlace"))
    await flush()
    fireEvent.click(dialogButton("Enviar enlace"))
    await flush()

    expect(dialog()?.textContent).toContain("Servicio de correo no disponible")
  })

  it("«Actualizar contraseña» abre un diálogo con los campos; al guardar se cierra y avisa", async () => {
    vi.mocked(updatePassword).mockResolvedValue(session)
    await renderPage()

    expect(document.body.querySelector("#current_password")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Actualizar contraseña" }))
    await flush()
    const fill = async (id: string, value: string): Promise<void> => {
      fireEvent.change(document.body.querySelector<HTMLInputElement>(`[role="dialog"] #${id}`)!, { target: { value } })
      await flush()
    }
    await fill("current_password", "Actual-2026!")
    await fill("password", "Nueva-clave-2026!")
    await fill("password_confirmation", "Nueva-clave-2026!")
    fireEvent.submit(document.body.querySelector<HTMLFormElement>('[role="dialog"] form')!)
    await flush()

    expect(updatePassword).toHaveBeenCalledWith("Nueva-clave-2026!", "Nueva-clave-2026!", "Actual-2026!")
    expect(toast.success).toHaveBeenCalledWith("Contraseña actualizada")
    expect(dialog()?.getAttribute("data-state") ?? "closed").toBe("closed")
  })

  it("si la contraseña actual es incorrecta, el error sale dentro del diálogo y no se cierra", async () => {
    vi.mocked(updatePassword).mockRejectedValue(new ApiError("Datos inválidos", 422, { current_password: ["La contraseña actual no es correcta."] }))
    await renderPage()
    fireEvent.click(screen.getByRole("button", { name: "Actualizar contraseña" }))
    await flush()
    for (const id of ["current_password", "password", "password_confirmation"]) fireEvent.change(document.getElementById(id)!, { target: { value: "Clave-2026" } })
    fireEvent.submit(document.body.querySelector<HTMLFormElement>('[role="dialog"] form')!)
    await flush()

    expect(dialog()?.getAttribute("data-state")).toBe("open")
    expect(dialog()?.textContent).toContain("La contraseña actual no es correcta")
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("valida en el navegador con el mismo esquema que el servidor y no envía un formulario incompleto", async () => {
    await renderPage()
    fireEvent.click(screen.getByRole("button", { name: "Actualizar contraseña" }))
    await flush()
    fireEvent.submit(document.body.querySelector<HTMLFormElement>('[role="dialog"] form')!)
    await flush()

    expect(updatePassword).not.toHaveBeenCalled()
    expect(dialog()?.textContent).toContain("El campo contraseña actual es obligatorio")
    expect(dialog()?.textContent).not.toContain("El campo contraseña actual es obligatorio.")
  })
})
