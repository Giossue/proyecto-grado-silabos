import { afterEach, describe, expect, it, vi } from "vitest"
import { goBack, trackNavigation } from "@/lib/goBack"

const router = () => ({ back: vi.fn(), push: vi.fn() })

describe("goBack", () => {
  afterEach(() => trackNavigation("/", null))

  it("vuelve a la lista tal como estaba, con su pestaña y filtros", () => {
    trackNavigation("/coordinacion/revisiones/r-1", "/coordinacion/revisiones?tab=seguimiento&search=alg")
    const target = router()

    goBack(target, "/coordinacion/revisiones")

    expect(target.back).toHaveBeenCalled()
    expect(target.push).not.toHaveBeenCalled()
  })

  it("sin historial de la lista, va a la lista", () => {
    trackNavigation("/coordinacion/revisiones/r-1", "/coordinacion/revisiones/otra-revision")
    const target = router()

    goBack(target, "/coordinacion/revisiones")

    expect(target.push).toHaveBeenCalledWith("/coordinacion/revisiones")
    expect(target.back).not.toHaveBeenCalled()
  })

  it("si se abrió la pantalla directo, va a la lista", () => {
    trackNavigation("/coordinacion/revisiones/r-1", null)
    const target = router()

    goBack(target, "/coordinacion/revisiones")

    expect(target.push).toHaveBeenCalledWith("/coordinacion/revisiones")
  })
})
