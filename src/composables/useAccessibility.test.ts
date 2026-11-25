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

    accessibilitySettings.update({ dyslexia: true })
    accessibilitySettings.reset()
    expect(document.documentElement.dataset.dyslexia).toBe("off")
  })

  it("activa el modo dislexia y lo recuerda", () => {
    expect(document.documentElement.dataset.dyslexia).toBe("off")
    accessibilitySettings.update({ dyslexia: true })

    expect(document.documentElement.dataset.dyslexia).toBe("on")
    expect(JSON.parse(localStorage.getItem("silabos:accesibilidad") ?? "{}")).toMatchObject({ dyslexia: true })
    initializeAccessibility()
    expect(accessibilitySettings.value.dyslexia).toBe(true)
    accessibilitySettings.reset()
    expect(document.documentElement.dataset.dyslexia).toBe("off")
  })
})

describe("accesibilidad en la cuenta", () => {
  it("adopta las preferencias de la cuenta al iniciar sesión y guarda los cambios", () => {
    vi.useFakeTimers()
    sessionState.replace({
      user: { id: "u1", name: "Ana", email: "a@x.test", email_verified: true, can_edit_identity: false, accessibility: { high_contrast: true, text_size: "150", no_motion: false, dyslexia: false } },
      active_role: null,
      available_roles: [],
    })
    expect(accessibilitySettings.value).toMatchObject({ highContrast: true, textSize: "150" })
    expect(updateAccessibility).not.toHaveBeenCalled()

    accessibilitySettings.update({ dyslexia: true })
    vi.advanceTimersByTime(600)
    expect(updateAccessibility).toHaveBeenCalledWith({ high_contrast: true, text_size: "150", no_motion: false, dyslexia: true })
    sessionState.clear()
    vi.useRealTimers()
  })

  it("lee el modo dislexia de la cuenta y lo apaga si la cuenta es anterior a la opción", () => {
    vi.useFakeTimers()
    sessionState.replace({
      user: { id: "u1", name: "Ana", email: "a@x.test", email_verified: true, can_edit_identity: false, accessibility: { high_contrast: false, text_size: "100", no_motion: false, dyslexia: true } },
      active_role: null,
      available_roles: [],
    })
    expect(accessibilitySettings.value.dyslexia).toBe(true)
    sessionState.clear()

    sessionState.replace({
      user: { id: "u2", name: "Luis", email: "l@x.test", email_verified: true, can_edit_identity: false, accessibility: { high_contrast: false, text_size: "115", no_motion: false, wide_spacing: false } as never },
      active_role: null,
      available_roles: [],
    })
    expect(accessibilitySettings.value).toMatchObject({ textSize: "115", dyslexia: false })

    accessibilitySettings.update({ dyslexia: true })
    vi.advanceTimersByTime(600)
    expect(updateAccessibility).toHaveBeenLastCalledWith(expect.objectContaining({ dyslexia: true, text_size: "115" }))
    sessionState.clear()
    vi.useRealTimers()
  })
})

describe("movimiento del sistema", () => {
  it("sigue el cambio del sistema mientras no haya preferencias guardadas", async () => {
    const listeners: Array<(event: MediaQueryListEvent) => void> = []
    const matchMedia = vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((type: string, listener: (event: MediaQueryListEvent) => void) => {
        if (type === "change" && query === "(prefers-reduced-motion: reduce)") listeners.push(listener)
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList)
    localStorage.clear()
    vi.resetModules()
    const fresh = await import("@/composables/useAccessibility")
    fresh.initializeAccessibility()

    listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent))
    expect(document.documentElement.dataset.motion).toBe("none")
    expect(localStorage.getItem("silabos:accesibilidad")).toBeNull()

    fresh.accessibilitySettings.update({ noMotion: false })
    listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent))
    expect(document.documentElement.dataset.motion).toBe("normal")
    matchMedia.mockRestore()
  })
})
