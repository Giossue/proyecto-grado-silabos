import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import type { DashboardDeadline } from "@/api/dashboard"
import { DeadlineChip } from "@/components/domain/DeadlineChip"

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

const chip = (value: Partial<DashboardDeadline>, audience: "docente" | "coordinador" | "bibliotecario" | "administrador" = "coordinador") => {
  render(<DeadlineChip deadline={{ ...deadline, ...value }} audience={audience} />)
  return screen.getByRole("button", { name: /^Plazo/ })
}

describe("DeadlineChip", () => {
  it.each([
    [{}, "15 días", "notice"],
    [{ days_until_due: 3 }, "3 días", "urgent"],
    [{ days_until_due: 1 }, "1 día", "urgent"],
    [{ days_until_due: 0 }, "Último día", "urgent"],
    [{ state: "upcoming", days_until_start: 0 }, "Inicia hoy", "notice"],
    [{ state: "upcoming", days_until_start: 1 }, "Inicia mañana", "notice"],
    [{ state: "upcoming", days_until_start: 4 }, "Inicia en 4 días", "notice"],
    [{ state: "overdue" }, "Plazo vencido", "urgent"],
    [{ state: "paused" }, "En pausa", "muted"],
    [{ state: "closed" }, "Finalizada", "muted"],
    [{ career_pending: true }, "Sin abrir", "notice"],
  ] as const)("resume el plazo en una etiqueta corta: %o", (value, label, tone) => {
    const element = chip(value)

    expect(element.textContent).toBe(label)
    expect(element.getAttribute("aria-label")).toBe(`Plazo: ${label}`)
    expect(element.dataset.tone).toBe(tone)
  })

  it("muestra el detalle completo al abrirla", async () => {
    const user = userEvent.setup()
    await user.click(chip({}))

    expect(await screen.findByText("Quedan 15 días para recibir y revisar los sílabos de su carrera")).toBeTruthy()
    expect(screen.getByText("Hasta el 28 de septiembre de 2026")).toBeTruthy()
  })
})
