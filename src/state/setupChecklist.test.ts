import { afterEach, describe, expect, it, vi } from "vitest"
import { getDashboard } from "@/api/dashboard"
import { sessionState } from "@/state/session"
import { setupChecklistState } from "@/state/setupChecklist"

vi.mock("@/api/dashboard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/dashboard")>()),
  getDashboard: vi.fn().mockResolvedValue({ metrics: [], setup: null, deadline: null, coordination_convocation: null }),
}))

describe("setupChecklistState", () => {
  afterEach(() => { vi.useRealTimers() })

  it("se recarga sola poco después de que una acción cambia datos, aunque acabe de cargarse", async () => {
    vi.useFakeTimers()
    sessionState.replace({ user: { id: "u1" }, active_role: { id: "r1", code: "coordinador" } } as never)
    await vi.runAllTimersAsync()
    const step = { key: "curriculum", label: "Malla", hint: "", done: true, action: null }
    vi.mocked(getDashboard).mockClear().mockResolvedValue({ metrics: [], setup: { title: "Antes de empezar", intro: "", done: 1, total: 1, steps: [step] }, deadline: null, coordination_convocation: null })

    window.dispatchEvent(new CustomEvent("silabos:mutated"))
    window.dispatchEvent(new CustomEvent("silabos:mutated"))
    await vi.runAllTimersAsync()

    expect(getDashboard).toHaveBeenCalledOnce()
    expect(setupChecklistState.setup.value?.steps[0]?.done).toBe(true)
  })
})
