import { fireEvent, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { getSystemSettings, testSystemConnection, updateSystemSettings, type SystemSettings } from "@/api/systemSettings"
import AdminSystemSettingsPage from "./AdminSystemSettingsPage"
import { toast } from "@/lib/toast"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/systemSettings", () => ({ getSystemSettings: vi.fn(), updateSystemSettings: vi.fn(), testSystemConnection: vi.fn() }))
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/layouts/settings/Layout", () => ({ SettingsLayout: ({ children }: { children?: ReactNode }) => <div>{children}</div> }))

const settings = (): SystemSettings => ({
  notifications: { emails: { value: true, source: "entorno" }, digest_time: { value: "08:00", source: "entorno" } },
  ai: {
    driver: { value: "deepseek", source: "entorno" },
    base_url: { value: "https://api.deepseek.com", source: "entorno" },
    model: { value: "deepseek-chat", source: "entorno" },
    api_key: { configured: true, source: "entorno" },
    connect_timeout: { value: 2, source: "entorno" },
    timeout: { value: 50, source: "entorno" },
  },
  library: { driver: { value: "koha", source: "pantalla" }, base_url: { value: "http://biblioteca.ueb.edu.ec", source: "pantalla" } },
})

const button = (text: string): HTMLButtonElement[] =>
  [...document.body.querySelectorAll<HTMLButtonElement>("button")].filter((item) => item.textContent?.trim() === text)
const openSection = async (title: string): Promise<void> => {
  fireEvent.click([...document.body.querySelectorAll<HTMLButtonElement>('[data-slot="accordion-trigger"]')].find((item) => item.textContent?.includes(title))!)
  await flush()
}
const setInput = async (id: string, value: string): Promise<void> => {
  fireEvent.change(document.body.querySelector<HTMLInputElement>(`#${id}`)!, { target: { value } })
  await flush()
}
const submitConfirmation = async (password: string): Promise<void> => {
  await setInput("confirm-current-password", password)
  fireEvent.submit(document.body.querySelector<HTMLFormElement>('[role="dialog"] form')!)
  await flush()
}
const simulateExitAnimation = (): void => {
  const style = document.createElement("style")
  style.dataset.exit = ""
  style.textContent = '[data-state="closed"] { animation-name: exit; }'
  document.head.append(style)
}

describe("Configuración › Sistema", () => {
  afterEach(() => document.head.querySelectorAll("style[data-exit]").forEach((style) => style.remove()))
  beforeEach(() => {
    vi.resetAllMocks()
    navigation.reset("/admin/configuracion/sistema")
    vi.mocked(getSystemSettings).mockResolvedValue(settings())
    vi.mocked(updateSystemSettings).mockResolvedValue(settings())
  })

  it("no muestra la clave ni parte de ella, ni de dónde sale cada ajuste", async () => {
    renderWithProviders(<AdminSystemSettingsPage />)
    await flush()
    await openSection("Asistente de IA")

    const text = document.body.textContent ?? ""
    expect(text).not.toContain("Clave guardada")
    expect(document.body.querySelector<HTMLInputElement>("#settings-ai-key")!.placeholder).toBe("Escriba una clave nueva solo para cambiarla")
    expect(document.body.querySelector('button[aria-label="Mostrar contraseña"]')).toBeNull()
    expect(document.body.querySelector('button[aria-label="Quitar la clave"]')).not.toBeNull()
    expect(text).not.toContain("variable de entorno")
    expect(document.body.querySelector<HTMLInputElement>("#settings-ai-key")!.value).toBe("")
  })

  it("muestra cada opción en su acordeón, con Notificaciones abierta al entrar", async () => {
    renderWithProviders(<AdminSystemSettingsPage />)
    await flush()

    expect(
      [...document.body.querySelectorAll('[data-slot="accordion-trigger"]')].map((item) => item.textContent?.trim().split(/Resumen|Proveedor|Catálogo/)[0]),
    ).toEqual(["Notificaciones", "Asistente de IA", "Biblioteca (Koha)"])
    expect(document.body.querySelector("#settings-digest-time")).not.toBeNull()
    expect(document.body.querySelector("#settings-ai-driver")).toBeNull()
    await openSection("Asistente de IA")
    expect(document.body.querySelector("#settings-ai-driver")).not.toBeNull()
    expect(document.body.querySelector("#settings-digest-time")).toBeNull()
  })

  it("«Guardar» se activa solo con cambios y las notificaciones se guardan sin contraseña", async () => {
    renderWithProviders(<AdminSystemSettingsPage />)
    await flush()
    expect(button("Guardar")[0]!.disabled).toBe(true)
    await setInput("settings-digest-time", "07:30")
    fireEvent.click(button("Guardar")[0]!)
    await flush()

    expect(updateSystemSettings).toHaveBeenCalledWith("notificaciones", { emails: true, digest_time: "07:30" })
    expect(toast.success).toHaveBeenCalledWith("Ajustes guardados")
  })

  it("la IA pide la contraseña y solo manda la clave si se escribió una nueva", async () => {
    renderWithProviders(<AdminSystemSettingsPage />)
    await flush()
    await openSection("Asistente de IA")
    expect(button("Guardar")[0]!.disabled).toBe(true)
    await setInput("settings-ai-model", "deepseek-flash")

    fireEvent.click(button("Guardar")[0]!)
    await flush()
    expect(updateSystemSettings).not.toHaveBeenCalled()
    await submitConfirmation("Demo-2026!")
    expect(updateSystemSettings).toHaveBeenLastCalledWith("ia", expect.not.objectContaining({ api_key: expect.anything() }))
    expect(updateSystemSettings).toHaveBeenLastCalledWith("ia", expect.objectContaining({ current_password: "Demo-2026!", driver: "deepseek", model: "deepseek-flash" }))

    await setInput("settings-ai-key", "sk-nueva-11112222")
    fireEvent.click(button("Guardar")[0]!)
    await flush()
    await submitConfirmation("Demo-2026!")
    expect(updateSystemSettings).toHaveBeenLastCalledWith("ia", expect.objectContaining({ api_key: "sk-nueva-11112222" }))

    fireEvent.click(document.body.querySelector<HTMLButtonElement>('button[aria-label="Quitar la clave"]')!)
    await flush()
    fireEvent.click(button("Guardar")[0]!)
    await flush()
    await submitConfirmation("Demo-2026!")
    expect(updateSystemSettings).toHaveBeenLastCalledWith("ia", expect.objectContaining({ clear_api_key: true }))
  })

  it("«Probar conexión» avisa el resultado", async () => {
    vi.mocked(testSystemConnection)
      .mockResolvedValueOnce({ ok: true, message: "Conexión correcta: 3 bibliotecas" })
      .mockResolvedValueOnce({ ok: false, message: "El proveedor no aceptó la clave" })
    renderWithProviders(<AdminSystemSettingsPage />)
    await flush()

    await openSection("Biblioteca")
    fireEvent.click(button("Probar conexión")[0]!)
    await flush()
    expect(testSystemConnection).toHaveBeenCalledWith("biblioteca")
    expect(toast.success).toHaveBeenCalledWith("Conexión correcta: 3 bibliotecas")

    await openSection("Asistente de IA")
    fireEvent.click(button("Probar conexión")[0]!)
    await flush()
    expect(testSystemConnection).toHaveBeenLastCalledWith("ia")
    expect(toast.error).toHaveBeenCalledWith("El proveedor no aceptó la clave")
  })

  it("al cerrar la confirmación conserva su título y su aviso, y al abrirla de nuevo el aviso vuelve a empezar", async () => {
    simulateExitAnimation()
    vi.mocked(updateSystemSettings).mockRejectedValueOnce(new ApiError("Datos inválidos", 422, { current_password: ["La contraseña no es correcta"] }))
    renderWithProviders(<AdminSystemSettingsPage />)
    await flush()
    await openSection("Asistente de IA")
    await setInput("settings-ai-model", "deepseek-flash")
    fireEvent.click(button("Guardar")[0]!)
    await flush()
    await submitConfirmation("mala")
    const dialog = (): HTMLElement => document.body.querySelector<HTMLElement>('[role="dialog"]')!
    await waitFor(() => expect(dialog().textContent).toContain("La contraseña no es correcta"))

    fireEvent.click(button("Cancelar")[0]!)
    await waitFor(() => expect(dialog().dataset.state).toBe("closed"))
    expect(dialog().textContent).toContain("Guardar el asistente de IA")
    expect(dialog().textContent).toContain("La contraseña no es correcta")

    fireEvent.click(button("Guardar")[0]!)
    await waitFor(() => expect(dialog().dataset.state).toBe("open"))
    expect(dialog().textContent).toContain("Por seguridad, confirme su contraseña actual para guardar")
  })
})
