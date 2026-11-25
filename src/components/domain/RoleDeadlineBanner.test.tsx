import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DashboardDeadline } from "@/api/dashboard"
import { RoleDeadlineBanner, RoleDeadlineChip } from "@/components/domain/RoleDeadlineBanner"

const deadline: DashboardDeadline = {
  period: "2026-2027",
  starts_at: "2026-09-24T00:00:00Z",
  due_at: "2026-09-28T00:00:00Z",
  state: "active",
  days_until_start: 0,
  days_until_due: 15,
  convocation_id: "c1",
  paused_by: null,
  classes_ended: false,
  career_pending: false,
}

const current: { deadline: DashboardDeadline | null } = { deadline }

vi.mock("next/navigation", () => ({ usePathname: () => "/coordinacion/revisiones" }))
vi.mock("@/state/deadline", () => ({
  deadlineState: { refresh: () => Promise.resolve() },
  useDeadline: () => ({ deadline: current.deadline, audience: "coordinador" }),
}))

describe("RoleDeadlineBanner", () => {
  beforeEach(() => {
    current.deadline = deadline
  })

  it("con el plazo en curso, la franja queda solo para celular", () => {
    const { container } = render(<RoleDeadlineBanner />)

    expect(container.querySelector('[role="status"]')?.closest(".sm\\:hidden")).not.toBeNull()
  })

  it("si venció el plazo, la franja se ve en todas las pantallas", () => {
    current.deadline = { ...deadline, state: "overdue" }
    const { container } = render(<RoleDeadlineBanner />)

    expect(container.querySelector('[role="status"]')?.closest(".sm\\:hidden")).toBeNull()
    expect(container.textContent).toContain("Venció el plazo de entrega de los sílabos")
  })

  it("sin plazo no muestra nada", () => {
    current.deadline = null
    const { container } = render(<><RoleDeadlineBanner /><RoleDeadlineChip /></>)

    expect(container.textContent).toBe("")
  })

  it("la etiqueta de la barra resume el plazo", () => {
    render(<RoleDeadlineChip />)

    expect(screen.getByRole("button", { name: "Plazo: 15 días" })).toBeTruthy()
  })
})
