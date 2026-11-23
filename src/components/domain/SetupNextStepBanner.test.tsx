import { act, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SetupChecklist } from "@/api/dashboard"
import { SetupNextStepBanner } from "@/components/domain/SetupNextStepBanner"
import { sessionState } from "@/state/session"
import { setupChecklistState } from "@/state/setupChecklist"
import { renderWithProviders } from "@/test/render"

vi.mock("@/api/dashboard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/dashboard")>()),
  getDashboard: vi.fn().mockResolvedValue({ metrics: [], setup: null, deadline: null, coordination_convocation: null }),
}))

const setup = (done: boolean[]): SetupChecklist => {
  const keys = ["curriculum", "scheduled_subjects", "parallels", "teachers", "convocation"]

  return { title: "Antes de empezar", intro: "", done: 0, total: keys.length, steps: keys.map((key, index) => ({ key, label: `Paso ${key}.`, hint: `Pista ${key}.`, done: done[index] ?? false, action: null })) }
}

describe("SetupNextStepBanner", () => {
  beforeEach(() => {
    sessionState.replace({ user: { id: "u1" }, active_role: { id: "r1", code: "coordinador" } } as never)
  })

  it("dice qué paso sigue, con su número y su pista, en una franja de alto fijo", () => {
    act(() => setupChecklistState.update(setup([true, false])))
    const { container } = renderWithProviders(<SetupNextStepBanner />)

    expect(container.textContent).toContain("Paso 2 de 4: Paso scheduled_subjects")
    expect(container.textContent).toContain("Pista scheduled_subjects")
    expect(container.querySelector("[data-setup-next-step]")).toHaveClass("h-11")
    expect(container.querySelector("[data-setup-next-step]")).not.toHaveClass("flex-wrap")
  })

  it("«Ver los pasos» es un botón sin fondo que abre el panel «Antes de empezar»", async () => {
    act(() => setupChecklistState.update(setup([true, false])))
    const user = userEvent.setup()
    renderWithProviders(<SetupNextStepBanner />)
    const before = setupChecklistState.openRequests.value

    const button = screen.getByRole("button")
    expect(button.textContent).toBe("Ver los pasos")
    expect(button).toHaveAttribute("data-variant", "link")
    await user.click(button)
    expect(setupChecklistState.openRequests.value).toBe(before + 1)
  })

  it("con todo hecho, o sin checklist, desaparece", () => {
    act(() => setupChecklistState.update(setup([true, true, true, true, true])))
    const done = renderWithProviders(<SetupNextStepBanner />)
    expect(done.container.querySelector("[data-setup-next-step]")).toBeNull()
    done.unmount()
    act(() => setupChecklistState.update(null))
    expect(renderWithProviders(<SetupNextStepBanner />).container.querySelector("[data-setup-next-step]")).toBeNull()
  })
})
