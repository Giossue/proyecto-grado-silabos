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
  library: { driver: { value: "koha", source: "pantalla" }, base_url: { value: "http://biblioteca.ueb.edu.ec", source: "pantalla" } },
  teacher_assistant: { enabled: { value: false, source: "entorno" } },
})

const button = (text: string): HTMLButtonElement[] =>
  [...document.body.querySelectorAll<HTMLButtonElement>("button")].filter((item) => item.textContent?.trim() === text)
const openSection = async (title: string): Promise<void> => {
  fireEvent.click([...document.body.querySelectorAll<HTMLButtonElement>('[data-slot="accordion-trigger"]')].find((item) => item.textContent?.includes(title))!)
  await flush()
}
const saveIn = (title: string): HTMLButtonElement => {
  const section = [...document.body.querySelectorAll('[data-slot="accordion-item"]')].find((item) => item.querySelector('[data-slot="accordion-trigger"]')?.textContent?.includes(title))!
  return [...section.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === "Guardar")!
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

  it("ya no tiene la sección «Asistente de IA»: el proveedor no se configura en pantalla", async () => {
    renderWithProviders(<AdminSystemSettingsPage />)
    await flush()

    expect(document.body.textContent).not.toContain("Asistente de IA")
    expect(document.body.textContent).not.toContain("Proveedor")
    expect(document.body.querySelector('[id^="settings-ai"]')).toBeNull()
  })

  it("muestra cada opción en su acordeón, con Notificaciones abierta al entrar", async () => {
    renderWithProviders(<AdminSystemSettingsPage />)
    await flush()

    expect(
      [...document.body.querySelectorAll('[data-slot="accordion-trigger"]')].map((item) => item.textContent?.trim().split(/Resumen|Ayuda|Catálogo/)[0]),
    ).toEqual(["Notificaciones", "Asistente del docente", "Biblioteca (Koha)"])
    expect(document.body.querySelector("#settings-digest-time")).not.toBeNull()
    expect(document.body.querySelector("#settings-library-url")).toBeNull()
    await openSection("Biblioteca")
    expect(document.body.querySelector("#settings-library-url")).not.toBeNull()
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

  it("la biblioteca pide la contraseña antes de guardar", async () => {
    renderWithProviders(<AdminSystemSettingsPage />)
    await flush()
    await openSection("Biblioteca")
    expect(saveIn("Biblioteca").disabled).toBe(true)
    await setInput("settings-library-url", "http://koha.ueb.edu.ec")

    fireEvent.click(saveIn("Biblioteca"))
    await flush()
    expect(updateSystemSettings).not.toHaveBeenCalled()
    expect(document.body.querySelector('[role="dialog"]')!.textContent).toContain("Guardar la biblioteca")
    await submitConfirmation("Demo-2026!")

    expect(updateSystemSettings).toHaveBeenCalledWith("biblioteca", { driver: "koha", base_url: "http://koha.ueb.edu.ec", current_password: "Demo-2026!" })
    expect(toast.success).toHaveBeenCalledWith("Ajustes guardados")
  })

  it("el asistente del docente empieza apagado y se guarda solo, sin contraseña", async () => {
    const on = { ...settings(), teacher_assistant: { enabled: { value: true, source: "pantalla" as const } } }
    vi.mocked(updateSystemSettings).mockResolvedValue(on)
    renderWithProviders(<AdminSystemSettingsPage />)
    await flush()
    await openSection("Asistente del docente")

    const toggle = (): HTMLButtonElement => document.body.querySelector<HTMLButtonElement>("#settings-teacher-assistant")!
    expect(toggle().getAttribute("role")).toBe("switch")
    expect(toggle().getAttribute("aria-checked")).toBe("false")
    expect(document.body.querySelector('label[for="settings-teacher-assistant"]')!.textContent).toBe("Activar el asistente del docente")
    expect(document.body.textContent).toContain("No cambia el asistente de la plantilla")
    expect(button("Guardar")[0]!.disabled).toBe(true)
    expect(button("Probar conexión")).toHaveLength(0)

    fireEvent.click(toggle())
    await flush()
    fireEvent.click(button("Guardar")[0]!)
    await flush()

    expect(updateSystemSettings).toHaveBeenCalledTimes(1)
    expect(updateSystemSettings).toHaveBeenCalledWith("asistente-docente", { enabled: true })
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(toast.success).toHaveBeenCalledWith("Ajustes guardados")
    expect(toggle().getAttribute("aria-checked")).toBe("true")
    expect(button("Guardar")[0]!.disabled).toBe(true)
  })

  it("«Probar conexión» avisa el resultado", async () => {
    vi.mocked(testSystemConnection)
      .mockResolvedValueOnce({ ok: true, message: "Conexión correcta: 3 bibliotecas" })
      .mockResolvedValueOnce({ ok: false, message: "No se pudo consultar el catálogo de la biblioteca" })
    renderWithProviders(<AdminSystemSettingsPage />)
    await flush()

    await openSection("Biblioteca")
    fireEvent.click(button("Probar conexión")[0]!)
    await flush()
    expect(testSystemConnection).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith("Conexión correcta: 3 bibliotecas")

    fireEvent.click(button("Probar conexión")[0]!)
    await flush()
    expect(toast.error).toHaveBeenCalledWith("No se pudo consultar el catálogo de la biblioteca")
  })

  it("al cerrar la confirmación conserva su título y su aviso, y al abrirla de nuevo el aviso vuelve a empezar", async () => {
    simulateExitAnimation()
    vi.mocked(updateSystemSettings).mockRejectedValueOnce(new ApiError("Datos inválidos", 422, { current_password: ["La contraseña no es correcta"] }))
    renderWithProviders(<AdminSystemSettingsPage />)
    await flush()
    await openSection("Biblioteca")
    await setInput("settings-library-url", "http://koha.ueb.edu.ec")
    fireEvent.click(saveIn("Biblioteca"))
    await flush()
    await submitConfirmation("mala")
    const dialog = (): HTMLElement => document.body.querySelector<HTMLElement>('[role="dialog"]')!
    await waitFor(() => expect(dialog().textContent).toContain("La contraseña no es correcta"))

    fireEvent.click(button("Cancelar")[0]!)
    await waitFor(() => expect(dialog().dataset.state).toBe("closed"))
    expect(dialog().textContent).toContain("Guardar la biblioteca")
    expect(dialog().textContent).toContain("La contraseña no es correcta")

    fireEvent.click(saveIn("Biblioteca"))
    await waitFor(() => expect(dialog().dataset.state).toBe("open"))
    expect(dialog().textContent).toContain("Por seguridad, confirme su contraseña actual para guardar")
  })
})
