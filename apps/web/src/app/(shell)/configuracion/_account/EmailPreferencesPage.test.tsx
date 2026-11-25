import { fireEvent } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getEmailPreferences, updateEmailPreferences } from "@/api/emailPreferences"
import EmailPreferencesPage from "./EmailPreferencesPage"
import { toast } from "@/lib/toast"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/emailPreferences", () => ({ getEmailPreferences: vi.fn(), updateEmailPreferences: vi.fn() }))
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/layouts/settings/Layout", () => ({ SettingsLayout: ({ children }: { children?: ReactNode }) => <div>{children}</div> }))

const options = [
  { type: "convocatoria.abierta", label: "Convocatoria abierta", description: "Tiene sílabos por elaborar", enabled: true },
  { type: "silabo.aprobado", label: "Sílabo aprobado", description: "Su sílabo quedó aprobado, con el PDF listo", enabled: true },
]
const saveButton = () => [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Guardar")

describe("Configuración › Notificaciones", () => {
  beforeEach(() => {
    vi.mocked(getEmailPreferences).mockResolvedValue({ options })
  })

  it("muestra un interruptor por aviso de su rol y guarda solo si cambió algo", async () => {
    vi.mocked(updateEmailPreferences).mockResolvedValue({ options: [options[0]!, { ...options[1]!, enabled: false }] })
    renderWithProviders(<EmailPreferencesPage />)
    await flush()

    expect(document.body.textContent).toContain("Convocatoria abierta")
    expect(document.body.textContent).toContain("Su sílabo quedó aprobado, con el PDF listo")
    expect(saveButton()!.disabled).toBe(true)

    fireEvent.click(document.body.querySelector<HTMLButtonElement>("#email-notice-silabo\\.aprobado")!)
    await flush()
    expect(saveButton()!.disabled).toBe(false)
    fireEvent.click(saveButton()!)
    await flush()

    expect(updateEmailPreferences).toHaveBeenCalledWith({ "convocatoria.abierta": true, "silabo.aprobado": false })
    expect(toast.success).toHaveBeenCalledWith("Avisos por correo guardados")
    expect(saveButton()!.disabled).toBe(true)
  })

  it("si su rol no recibe correos, lo dice y no ofrece guardar", async () => {
    vi.mocked(getEmailPreferences).mockResolvedValue({ options: [] })
    renderWithProviders(<EmailPreferencesPage />)
    await flush()

    expect(document.body.textContent).toContain("Su rol no recibe avisos por correo")
    expect(saveButton()).toBeUndefined()
  })
})
