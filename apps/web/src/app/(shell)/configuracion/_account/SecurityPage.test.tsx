import { fireEvent } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { requestPasswordRecovery, type Session } from "@/api/session"
import SecurityPage from "./SecurityPage"
import { toast } from "@/lib/toast"
import { sessionState } from "@/state/session"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/session", () => ({
  requestPasswordRecovery: vi.fn(),
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

  it("muestra solo el bloque «Contraseña», sin acordeón ni sesiones abiertas", async () => {
    await renderPage()

    expect(document.body.querySelector('[data-slot="accordion"]')).toBeNull()
    expect(document.body.querySelector("[aria-expanded]")).toBeNull()
    expect(document.body.querySelector("h2")?.textContent).toBe("Contraseña")
    expect(document.body.textContent).toContain("Pida un enlace por correo para crear otra")
    expect(pageButton("Enviar enlace")).toBeTruthy()
    expect(document.body.querySelector("#current_password")).toBeNull()
    expect(document.body.textContent).not.toContain("Actualizar contraseña")
    expect(document.body.textContent).not.toContain("Verificación en dos pasos")
    expect(document.body.textContent).not.toContain("Sesiones abiertas")
  })
})
