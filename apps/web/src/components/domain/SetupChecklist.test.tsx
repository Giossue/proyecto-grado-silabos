import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SetupChecklist } from "@/components/domain/SetupChecklist"
import { toast } from "@/lib/toast"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"

const checklist = vi.hoisted(() => ({ stepDone: false, openRequests: 0 }))

vi.mock("next/navigation", async () => await import("@/test/nextNavigation"))
vi.mock("@/state/session", async (importOriginal) => ({ ...(await importOriginal<object>()), useSession: () => ({ session: { user: { id: "u1" }, active_role: { id: "r1", code: "coordinador_carrera" } } }) }))
vi.mock("@/state/setupChecklist", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSetupChecklist: () => {
    const steps = [{ key: "malla", label: "Armar la malla", hint: "", done: checklist.stepDone }]
    const start = { key: "convocation", label: "Abrir", hint: "Espera a que Administración abra el periodo académico.", done: false, action: null }
    return { setup: { title: "Antes de empezar", steps: [...steps, start] }, steps, start, openRequests: checklist.openRequests }
  },
}))

const card = () => document.querySelector(".driver-checklist.setup-checklist")

const mount = async () => {
  navigation.reset("/coordinacion/revisiones")
  const view = renderWithProviders(<SetupChecklist />)
  await flush()
  return view
}

beforeEach(() => {
  checklist.stepDone = false
  checklist.openRequests = 0
})

afterEach(() => {
  document.body.innerHTML = ""
  localStorage.clear()
  vi.restoreAllMocks()
})

describe("SetupChecklist", () => {
  it("nombra en español el botón que cierra la lista", async () => {
    const view = await mount()

    expect(document.querySelector(".driver-checklist-close-btn")?.getAttribute("aria-label")).toBe("Cerrar la lista")
    view.unmount()
  })

  it("con todos los pasos completos no aparece", async () => {
    checklist.stepDone = true
    const view = await mount()

    expect(card()).toBeNull()
    view.unmount()
  })

  it("se quita al completar el último paso", async () => {
    const view = await mount()
    expect(card()).not.toBeNull()

    checklist.stepDone = true
    view.rerender(<SetupChecklist />)
    await flush()

    expect(card()).toBeNull()
    view.unmount()
  })

  it("con pasos pendientes, pedir abrirla despliega la lista", async () => {
    localStorage.setItem("setup-checklist-seen:undefined:undefined", "1")
    const info = vi.spyOn(toast, "info")
    const view = await mount()
    const panel = () => document.querySelector<HTMLElement>(".setup-checklist .driver-checklist-panel")
    expect(panel()?.hidden ?? true).toBe(true)

    checklist.openRequests = 1
    view.rerender(<SetupChecklist />)
    await flush()

    expect(panel()?.hidden).toBe(false)
    expect(info).not.toHaveBeenCalled()
    view.unmount()
  })

  it("con los pasos completos, pedir abrirla avisa por qué aún no se puede abrir el periodo", async () => {
    checklist.stepDone = true
    const info = vi.spyOn(toast, "info")
    const view = await mount()

    checklist.openRequests = 1
    view.rerender(<SetupChecklist />)
    await flush()

    expect(info).toHaveBeenCalledExactlyOnceWith("Espera a que Administración abra el periodo académico.")
    expect(card()).toBeNull()
    view.unmount()
  })

  it("al volver a montarse no repite el aviso de una petición anterior", async () => {
    checklist.stepDone = true
    checklist.openRequests = 1
    const info = vi.spyOn(toast, "info")
    const view = await mount()

    expect(info).not.toHaveBeenCalled()
    view.unmount()
  })
})
