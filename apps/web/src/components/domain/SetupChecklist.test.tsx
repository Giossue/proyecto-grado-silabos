import { afterEach, describe, expect, it, vi } from "vitest"
import { SetupChecklist } from "@/components/domain/SetupChecklist"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("next/navigation", async () => await import("@/test/nextNavigation"))
vi.mock("@/state/session", async (importOriginal) => ({ ...(await importOriginal<object>()), useSession: () => ({ session: { user: { id: "u1" }, active_role: { id: "r1", code: "coordinador_carrera" } } }) }))
vi.mock("@/state/setupChecklist", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSetupChecklist: () => ({ setup: { title: "Antes de empezar" }, steps: [{ key: "malla", label: "Armar la malla", hint: "", done: false }], start: undefined, openRequests: 0 }),
}))

afterEach(() => {
  document.body.innerHTML = ""
  localStorage.clear()
})

describe("SetupChecklist", () => {
  it("nombra en español el botón que cierra la lista", async () => {
    navigation.reset("/coordinacion/revisiones")
    const view = renderWithProviders(<SetupChecklist />)
    await flush()

    expect(document.querySelector(".driver-checklist-close-btn")?.getAttribute("aria-label")).toBe("Cerrar la lista")
    view.unmount()
  })
})
