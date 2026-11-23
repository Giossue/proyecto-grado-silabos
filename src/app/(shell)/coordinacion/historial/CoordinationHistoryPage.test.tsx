import { fireEvent } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getCoordinationHistory, type CoordinationHistoryPage as HistoryPayload } from "@/api/reviews"
import { openRevisionPdf } from "@/lib/openPdf"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"
import CoordinationHistoryPage from "./CoordinationHistoryPage"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/reviews", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/reviews")>()),
  getCoordinationHistory: vi.fn(),
}))
vi.mock("@/lib/openPdf", () => ({ openRevisionPdf: vi.fn() }))

type Item = HistoryPayload["syllabi"]["data"][number]

const item = (overrides: Partial<Item>): Item => ({
  id: "syllabus-1", revision_id: "revision-1", period: "2025-2026", subject: "Arquitectura de Software", code: "SW-601",
  parallels: ["A"], author: "Docente Anterior", approved_at: "2026-02-10T15:00:00+00:00", ...overrides,
})

const history = (): HistoryPayload => ({
  filters: { q: null, period: null },
  periods: [{ id: "p2", code: "2025-2026" }, { id: "p1", code: "2024-2025" }],
  syllabi: {
    data: [
      item({}),
      item({ id: "syllabus-2", revision_id: "revision-2", subject: "Bases de Datos", code: "SW-602", parallels: ["B"] }),
      item({ id: "syllabus-3", revision_id: "revision-3", period: "2024-2025", subject: "Redes", code: "SW-701" }),
    ],
    current_page: 1, last_page: 1, per_page: 20, from: 1, to: 3, total: 3,
  },
})

const mountPage = async () => {
  const view = renderWithProviders(<CoordinationHistoryPage />)
  await flush()
  return view
}

describe("CoordinationHistoryPage", () => {
  beforeEach(() => {
    navigation.reset("/coordinacion/historial")
    vi.mocked(openRevisionPdf).mockReset().mockResolvedValue(null)
    vi.mocked(getCoordinationHistory).mockReset().mockResolvedValue(history())
  })

  it("agrupa los aprobados por período, del más reciente al más antiguo, con su autor", async () => {
    const { container } = await mountPage()

    expect(getCoordinationHistory).toHaveBeenCalledWith({ q: "", period: "all", page: 1 })
    expect([...container.querySelectorAll("h2")].map((heading) => heading.textContent)).toEqual(["Período 2025-2026", "Período 2024-2025"])
    const tables = [...container.querySelectorAll("table")]
    expect(tables).toHaveLength(2)
    expect([...tables[0]!.querySelectorAll("thead th")].map((header) => header.textContent)).toEqual(["Asignatura", "Código", "Paralelos", "Elaborado por", "Aprobado", "PDF"])
    expect(tables[0]!.querySelectorAll("tbody tr")).toHaveLength(2)
    const first = tables[0]!.querySelector("tbody tr")!
    expect(first.textContent).toContain("Arquitectura de Software")
    expect(first.textContent).toContain("SW-601")
    expect(first.textContent).toContain("Docente Anterior")
    expect(tables[1]!.textContent).toContain("Redes")

    fireEvent.click(first)
    expect(navigation.push).toHaveBeenCalledWith("/coordinacion/revisiones/revision-1")
  })

  it("ofrece volver a Revisión", async () => {
    const { container } = await mountPage()
    const back = [...container.querySelectorAll("button")].find((button) => button.textContent === "Volver a revisión")

    expect(back).toBeDefined()
    fireEvent.click(back!)
    expect(navigation.push).toHaveBeenCalledWith("/coordinacion/revisiones")
  })

  it("«Ver PDF» abre el PDF de esa revisión sin abrir la fila", async () => {
    const { container } = await mountPage()

    const buttons = container.querySelectorAll('button[aria-label="Ver PDF de Bases de Datos"]')
    expect(buttons).toHaveLength(1)
    fireEvent.click(buttons[0]!)
    await flush()
    expect(openRevisionPdf).toHaveBeenCalledWith("revision-2")
    expect(navigation.push).not.toHaveBeenCalled()
  })

  it("busca y filtra por período desde la URL", async () => {
    navigation.reset("/coordinacion/historial?q=bases&period=p1")
    const { container } = await mountPage()

    expect(getCoordinationHistory).toHaveBeenCalledWith({ q: "bases", period: "p1", page: 1 })
    expect(navigation.fullPath).toBe("/coordinacion/historial?q=bases&period=p1")

    fireEvent.change(container.querySelector('input[type="search"]')!, { target: { value: "redes" } })
    fireEvent.submit(container.querySelector("form")!)
    await flush()
    expect(getCoordinationHistory).toHaveBeenLastCalledWith({ q: "redes", period: "p1", page: 1 })
    expect(navigation.fullPath).toBe("/coordinacion/historial?q=redes&period=p1")
  })

  it("explica cuando no hay sílabos aprobados de períodos anteriores", async () => {
    vi.mocked(getCoordinationHistory).mockResolvedValue({ ...history(), syllabi: { ...history().syllabi, data: [], total: 0, from: null, to: null } })
    const { container } = await mountPage()

    expect(container.textContent).toContain("No hay sílabos aprobados de períodos anteriores con estos filtros")
  })
})
