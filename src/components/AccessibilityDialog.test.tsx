import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { AccessibilityDialog } from "@/components/AccessibilityDialog"
import { initializeAccessibility } from "@/composables/useAccessibility"
import { renderWithProviders } from "@/test/render"

vi.mock("@/api/session", () => ({ updateAccessibility: vi.fn().mockResolvedValue({}), getSession: vi.fn() }))

describe("AccessibilityDialog", () => {
  it("abre el modal y cambia el tamaño del texto", async () => {
    localStorage.clear()
    initializeAccessibility()
    const user = userEvent.setup()
    renderWithProviders(<AccessibilityDialog />)
    await user.click(screen.getByRole("button", { name: "Accesibilidad" }))

    expect(document.body.textContent).toContain("Alto contraste")
    expect(document.body.textContent).toContain("Sin animaciones")
    await user.click(screen.getByRole("radio", { name: "Muy grande" }))
    expect(document.documentElement.dataset.textSize).toBe("130")
  })

  it("Restablecer está desactivado mientras no haya cambios", async () => {
    localStorage.clear()
    initializeAccessibility()
    const user = userEvent.setup()
    renderWithProviders(<AccessibilityDialog />)
    await user.click(screen.getByRole("button", { name: "Accesibilidad" }))
    const reset = (): HTMLButtonElement => screen.getByRole("button", { name: "Restablecer" })

    expect(reset()).toBeDisabled()
    await user.click(screen.getByRole("radio", { name: "Grande" }))
    expect(reset()).toBeEnabled()
  })

  it("activa el modo dislexia desde el modal", async () => {
    localStorage.clear()
    initializeAccessibility()
    const user = userEvent.setup()
    renderWithProviders(<AccessibilityDialog />)
    await user.click(screen.getByRole("button", { name: "Accesibilidad" }))

    expect(document.body.textContent).toContain("Letra para dislexia")
    expect(document.body.textContent).not.toContain("Texto más espaciado")
    await user.click(screen.getByRole("switch", { name: "Modo dislexia" }))
    expect(document.documentElement.dataset.dyslexia).toBe("on")
    expect(screen.getByRole("button", { name: "Restablecer" })).toBeEnabled()
  })

  it("el botón flotante mide lo mismo que el de ayuda", () => {
    renderWithProviders(<AccessibilityDialog floating />)

    expect(screen.getByRole("button", { name: "Accesibilidad" })).toHaveClass("size-12")
  })
})
