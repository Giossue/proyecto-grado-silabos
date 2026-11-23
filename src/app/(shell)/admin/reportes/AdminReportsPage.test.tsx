import { fireEvent } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { downloadProcessReport, getProcessReport, type ReportPayload } from "@/api/reports"
import AdminReportsPage from "./AdminReportsPage"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/reports", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/reports")>()),
  getProcessReport: vi.fn(),
  downloadProcessReport: vi.fn(),
}))
vi.mock("recharts", () => ({
  BarChart: ({ children }: { children?: ReactNode }) => <div data-chart>{children}</div>,
  Bar: () => <i />,
  CartesianGrid: () => <i />,
  XAxis: () => <i data-axis="x" />,
  YAxis: ({ ticks }: { ticks?: number[] }) => <i data-axis="y" data-ticks={ticks?.join(",")} />,
}))
vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ChartLegend: () => <i />,
  ChartLegendContent: () => <i />,
  ChartTooltip: () => <i />,
  ChartTooltipContent: () => <i />,
}))

const states = (a: number, b: number, c: number, d: number, e: number) => ({ sin_iniciar: a, borrador: b, en_revision: c, correccion_solicitada: d, aprobado: e })
const payload: ReportPayload = {
  options: [{ value: "p1", label: "Octubre-Febrero 2026-2027" }],
  report: {
    process: { id: "p1", period: "Octubre-Febrero 2026-2027", starts_at: "2026-10-01", due_at: "2026-12-31", state: "abierto" },
    kpis: { total: 12, approved_percent: 50, on_time_percent: null, review_days: 2.5 },
    careers: [
      { career: "Software", total: 12, states: states(1, 2, 2, 1, 6), returns: { coordinacion: 2, biblioteca: 1 }, late: 1, approved: 6, pending: 6, returned: 1, progress: 50 },
    ],
    daily: [],
    pending: [{ teachers: "ANA PÉREZ", career: "Software", subject: "Programación Básica", parallel: "A", state: "borrador", late: true }],
  },
}

const text = (): string => document.body.textContent ?? ""
const table = (label: string): HTMLTableElement => document.body.querySelector<HTMLTableElement>(`table[aria-label="${label}"]`)!

describe("AdminReportsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    navigation.reset("/admin/reportes")
    vi.mocked(getProcessReport).mockResolvedValue(payload)
  })

  it("muestra las cifras, las gráficas y las tablas por carrera y de pendientes", async () => {
    renderWithProviders(<AdminReportsPage />)
    await flush()

    expect(getProcessReport).toHaveBeenCalledWith(null)
    expect(text()).toContain("Aprobados")
    expect(text()).toContain("Todavía no hay envíos")
    expect(text()).toContain("Avance por carrera")
    expect(text()).toContain("Devoluciones")
    expect(document.body.querySelectorAll("[data-chart]")).toHaveLength(2)
    expect(table("Avance por carrera").textContent).toContain("Software")
    expect(table("Avance por carrera").textContent).toContain("50 %")
    expect(table("Sílabos pendientes por docente").textContent).toContain("ANA PÉREZ")
    expect(text()).toContain("(atrasado)")
  })

  it("marca solo números enteros en el eje vertical de las gráficas", async () => {
    renderWithProviders(<AdminReportsPage />)
    await flush()

    const ticks = [...document.body.querySelectorAll<HTMLElement>('[data-axis="y"]')].map((axis) => axis.dataset.ticks)
    expect(ticks).toEqual(["0,3,6,9,12", "0,1,2"])
  })

  it("exporta a Excel la convocatoria elegida", async () => {
    vi.mocked(downloadProcessReport).mockResolvedValue()
    renderWithProviders(<AdminReportsPage />)
    await flush()

    fireEvent.click([...document.body.querySelectorAll("button")].find((button) => button.textContent === "Exportar a Excel")!)
    await flush()
    expect(downloadProcessReport).toHaveBeenCalledWith("p1", "reporte-octubre-febrero-2026-2027.xlsx")
  })

  it("abre la convocatoria que trae la dirección", async () => {
    navigation.reset("/admin/reportes?convocatoria=p1")
    renderWithProviders(<AdminReportsPage />)
    await flush()

    expect(getProcessReport).toHaveBeenCalledWith("p1")
  })

  it("sin convocatorias lo dice en una card de vacío", async () => {
    vi.mocked(getProcessReport).mockResolvedValue({ options: [], report: null })
    renderWithProviders(<AdminReportsPage />)
    await flush()

    expect(text()).toContain("Todavía no hay convocatorias")
  })
})
