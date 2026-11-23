import { act, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { listAvailableScreenHelp } from "@/api/screen-help"
import { ScreenHelpButton } from "@/components/domain/ScreenHelpButton"
import { sessionState } from "@/state/session"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/screen-help", () => ({ listAvailableScreenHelp: vi.fn() }))

const help = { screen: "/admin/usuarios", title: "Usuarios y roles", content: "Primer párrafo.\n\nSegundo párrafo." }
const signIn = (): void => act(() => sessionState.replace({ user: { id: "u1" }, active_role: { code: "administrador" } } as never))
const visible = (element: Element) => Object.defineProperty(element, "getClientRects", { value: () => [{}] })
const button = (): HTMLElement => screen.getByRole("button", { name: "Ayuda de esta pantalla" })

describe("ScreenHelpButton", () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ""
    navigation.reset("/admin/usuarios")
    vi.mocked(listAvailableScreenHelp).mockReset()
    sessionState.clear()
  })

  it("sin elementos que señalar, la guía muestra el texto completo de la pantalla", async () => {
    vi.mocked(listAvailableScreenHelp).mockResolvedValue({ help: [help] })
    signIn()
    const user = userEvent.setup()
    renderWithProviders(<main><ScreenHelpButton /></main>)
    await flush()

    expect(listAvailableScreenHelp).toHaveBeenCalledTimes(1)
    await user.click(button())
    const popover = document.body.querySelector(".driver-popover")!
    expect(popover.textContent).toContain("Usuarios y roles")
    expect(popover.textContent).toContain("Segundo párrafo.")
  })

  it("con elementos en pantalla, empieza por el texto de la pantalla y recorre cada elemento con su avance", async () => {
    vi.mocked(listAvailableScreenHelp).mockResolvedValue({ help: [help] })
    signIn()
    document.body.insertAdjacentHTML("beforeend", '<div data-tour="page-actions">Acciones</div><div data-slot="table-container">Tabla</div>')
    document.body.querySelectorAll("[data-tour], [data-slot]").forEach(visible)
    const user = userEvent.setup()
    renderWithProviders(<main><ScreenHelpButton /></main>)
    await flush()

    await user.click(button())
    let popover = document.body.querySelector(".driver-popover")!
    expect(popover.textContent).toContain("Primer párrafo.")
    expect(popover.textContent).not.toContain("Segundo párrafo.")
    ;(popover.querySelector(".driver-popover-next-btn") as HTMLElement).click()
    popover = document.body.querySelector(".driver-popover")!
    expect(popover.textContent).toContain("Crear cuentas")
    expect(popover.textContent).toContain("2 de 3")
  })

  it("no muestra el botón si la pantalla no tiene ayuda", async () => {
    vi.mocked(listAvailableScreenHelp).mockResolvedValue({ help: [] })
    signIn()
    renderWithProviders(<main><ScreenHelpButton /></main>)
    await flush()

    expect(screen.queryByRole("button", { name: "Ayuda de esta pantalla" })).toBeNull()
  })

  it("queda fijo arriba del botón de accesibilidad, sin poder moverse", async () => {
    vi.mocked(listAvailableScreenHelp).mockResolvedValue({ help: [help] })
    signIn()
    renderWithProviders(<main><ScreenHelpButton /></main>)
    await flush()

    expect(button()).toHaveClass("fixed", "sm:bottom-20", "sm:right-4")
  })

  it("en el editor de la plantilla va abajo a la izquierda, lejos del botón «Asistente»", async () => {
    vi.mocked(listAvailableScreenHelp).mockResolvedValue({ help: [help] })
    signIn()
    renderWithProviders(<main><ScreenHelpButton editorMode corner="left" /></main>)
    await flush()

    expect(button()).toHaveClass("sm:left-4", "sm:bottom-4", "max-sm:bottom-20")
    expect(button()).not.toHaveClass("sm:right-4")
  })

  it("en móvil se esconde al bajar y reaparece al subir, como los botones principales", async () => {
    vi.mocked(listAvailableScreenHelp).mockResolvedValue({ help: [help] })
    signIn()
    document.body.innerHTML = '<div data-app-scroll><div data-slot="scroll-area-viewport"></div></div>'
    const viewport = document.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 0 })
    renderWithProviders(<main><ScreenHelpButton /></main>)
    await flush()

    expect(button()).not.toHaveClass("max-sm:translate-y-24")
    viewport.scrollTop = 400
    act(() => { viewport.dispatchEvent(new Event("scroll")) })
    await flush()
    expect(button()).toHaveClass("max-sm:translate-y-24", "max-sm:opacity-0")

    viewport.scrollTop = 300
    act(() => { viewport.dispatchEvent(new Event("scroll")) })
    await flush()
    expect(button()).not.toHaveClass("max-sm:translate-y-24")
    vi.unstubAllGlobals()
  })
})
