import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { accessibilitySettings, initializeAccessibility } from "@/composables/useAccessibility"
import { sessionState } from "@/state/session"

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

describe("solo en el navegador", () => {
  afterEach(() => {
    sessionState.clear()
    vi.restoreAllMocks()
  })

  it("guarda los cambios en el navegador sin llamar al servidor", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    localStorage.clear()
    initializeAccessibility()
    accessibilitySettings.update({ highContrast: true, dyslexia: true })
    accessibilitySettings.reset()
    accessibilitySettings.update({ textSize: "150" })

    expect(JSON.parse(localStorage.getItem("silabos:accesibilidad") ?? "{}")).toMatchObject({ textSize: "150", highContrast: false })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("conserva las preferencias del navegador al iniciar y cerrar sesión", () => {
    localStorage.clear()
    initializeAccessibility()
    accessibilitySettings.update({ highContrast: true, textSize: "130" })

    sessionState.replace({
      user: { id: "u1", name: "Ana", email: "a@x.test", email_verified: true, can_edit_identity: false, accessibility: { high_contrast: false, text_size: "100", no_motion: false, dyslexia: true } } as never,
      active_role: null,
      available_roles: [],
    })
    expect(accessibilitySettings.value).toMatchObject({ highContrast: true, textSize: "130", dyslexia: false })

    sessionState.clear()
    expect(accessibilitySettings.value).toMatchObject({ highContrast: true, textSize: "130" })
    expect(JSON.parse(localStorage.getItem("silabos:accesibilidad") ?? "{}")).toMatchObject({ highContrast: true, textSize: "130" })
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

    fresh.accessibilitySettings.reset()
    expect(localStorage.getItem("silabos:accesibilidad")).toBeNull()
    listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent))
    expect(document.documentElement.dataset.motion).toBe("none")
    matchMedia.mockRestore()
  })
})

describe("varias pestañas", () => {
  it("aplica lo que otra pestaña guarda o restablece sin volver a guardarlo", () => {
    localStorage.clear()
    initializeAccessibility()
    const fromOtherTab = (value: string | null): void => {
      if (value === null) localStorage.removeItem("silabos:accesibilidad")
      else localStorage.setItem("silabos:accesibilidad", value)
      window.dispatchEvent(new StorageEvent("storage", { key: "silabos:accesibilidad", newValue: value }))
    }

    fromOtherTab(JSON.stringify({ highContrast: true, textSize: "130", dyslexia: true }))
    expect(accessibilitySettings.value).toMatchObject({ highContrast: true, textSize: "130", dyslexia: true })
    expect(document.documentElement.dataset.contrast).toBe("high")

    fromOtherTab(null)
    expect(accessibilitySettings.value).toMatchObject({ highContrast: false, textSize: "100", dyslexia: false })
    expect(document.documentElement.dataset.contrast).toBe("normal")
    expect(localStorage.getItem("silabos:accesibilidad")).toBeNull()
  })
})
