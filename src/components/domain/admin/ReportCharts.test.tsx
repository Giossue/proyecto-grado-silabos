import { render } from "@testing-library/react"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { ReportDailyChart, ReportReturnsChart, ReportStatesChart, integerTicks } from "@/components/domain/admin/ReportCharts"
import { flush } from "@/test/render"

const career = {
  career: "Software",
  total: 12,
  states: { sin_iniciar: 1, borrador: 2, en_revision: 2, correccion_solicitada: 1, aprobado: 6 },
  returns: { coordinacion: 2, biblioteca: 1 },
  late: 1,
  approved: 6,
  pending: 6,
  returned: 1,
  progress: 50,
}

const legend = (container: HTMLElement): string[] =>
  [...container.querySelectorAll<HTMLElement>(".recharts-legend-wrapper > div > div")].map((item) => item.textContent ?? "")

describe("ReportCharts", () => {
  beforeAll(() => {
    const measure = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("recharts-responsive-container") ? DOMRect.fromRect({ width: 600, height: 300 }) : measure.call(this)
    })
  })
  afterAll(() => vi.restoreAllMocks())

  it("solo marca números enteros, aunque no haya datos", () => {
    expect(integerTicks([12])).toEqual([0, 3, 6, 9, 12])
    expect(integerTicks([2, 1])).toEqual([0, 1, 2])
    expect(integerTicks([])).toEqual([0, 1])
  })

  it("dibuja los estados, los envíos y las devoluciones con las series y nombres de la SPA", async () => {
    const states = render(<ReportStatesChart careers={[career]} />)
    const daily = render(<ReportDailyChart daily={[{ day: "2026-10-05", first: 3, resubmitted: 1 }]} />)
    const returns = render(<ReportReturnsChart careers={[career]} />)
    await flush()

    expect(legend(states.container)).toEqual(["Sin iniciar", "Borrador", "En revisión", "Devuelto", "Aprobado"])
    expect(legend(daily.container)).toEqual(["Primeros envíos", "Reenvíos"])
    expect(legend(returns.container)).toEqual(["Coordinación", "Biblioteca"])
    expect(states.container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(5)
    expect(states.container.querySelector(".recharts-xAxis-tick-labels")!.textContent).toBe("Software")
    expect([...states.container.querySelectorAll(".recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value")].map((tick) => tick.textContent)).toEqual(["0", "3", "6", "9", "12"])
    expect(returns.container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(2)
  })
})
