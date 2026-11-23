import { beforeEach, describe, expect, it, vi } from "vitest"
import { updateAccessibility } from "@/api/session"
import { accessibilitySettings, initializeAccessibility } from "@/composables/useAccessibility"
import { sessionState } from "@/state/session"

vi.mock("@/api/session", () => ({ updateAccessibility: vi.fn().mockResolvedValue({}), getSession: vi.fn() }))

describe("accesibilidad", () => {
  beforeEach(() => {
    localStorage.clear()
    initializeAccessibility()
  })

  it("aplica y recuerda las preferencias", () => {
    accessibilitySettings.update({ highContrast: true, textSize: "130" })

    expect(document.documentElement.dataset.contrast).toBe("high")
    expect(document.documentElement.dataset.textSize).toBe("130")
    expect(JSON.parse(localStorage.getItem("silabos:accesibilidad") ?? "{}")).toMatchObject({ highContrast: true, textSize: "130" })

    initializeAccessibility()
    expect(accessibilitySettings.value.textSize).toBe("130")
  })

  it("ignora valores guardados que no son válidos y restablece", () => {
    localStorage.setItem("silabos:accesibilidad", JSON.stringify({ textSize: "999", highContrast: "sí" }))
    initializeAccessibility()
    expect(accessibilitySettings.value.textSize).toBe("100")
    expect(accessibilitySettings.value.highContrast).toBe(false)

    accessibilitySettings.update({ wideSpacing: true })
    accessibilitySettings.reset()
    expect(document.documentElement.dataset.spacing).toBe("normal")
  })
})

describe("accesibilidad en la cuenta", () => {
  it("adopta las preferencias de la cuenta al iniciar sesión y guarda los cambios", () => {
    vi.useFakeTimers()
    sessionState.replace({
      user: { id: "u1", name: "Ana", email: "a@x.test", email_verified: true, can_edit_identity: false, accessibility: { high_contrast: true, text_size: "150", no_motion: false, wide_spacing: false } },
      active_role: null,
      available_roles: [],
    })
    expect(accessibilitySettings.value).toMatchObject({ highContrast: true, textSize: "150" })
    expect(updateAccessibility).not.toHaveBeenCalled()

    accessibilitySettings.update({ wideSpacing: true })
    vi.advanceTimersByTime(600)
    expect(updateAccessibility).toHaveBeenCalledWith(expect.objectContaining({ wide_spacing: true, text_size: "150" }))
    sessionState.clear()
    vi.useRealTimers()
  })
})
