import { fireEvent, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getLibraryHistory, type LibraryHistoryPage as HistoryPayload } from "@/api/library"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"
import LibraryHistoryPage from "./LibraryHistoryPage"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/library", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/library")>()),
  getLibraryHistory: vi.fn(),
}))

const history = (): HistoryPayload => ({
  filters: { state: null, q: null, faculty: null },
  faculties: [{ id: "f1", name: "Ciencias Administrativas" }],
  periods: [{ id: "p1", code: "2025-2026" }],
  reviews: {
    data: [{
      revision_id: "revision-1", syllabus_id: "syllabus-1", subject: "Álgebra Lineal", code: "SW-B1-002", career: "Software", period: "2025-2026",
      parallels: ["A"], teachers: ["Domenica Arias"], revision_number: 1, sent_at: "2025-11-02T10:00:00-05:00", sent_by: "Domenica Arias", signed_by: "Bibliotecaria Demo", state: "atendido", outcome: "firmado",
    }],
    current_page: 1, last_page: 1, per_page: 20, from: 1, to: 1, total: 1,
  },
})

const mountPage = async () => {
  const view = renderWithProviders(<LibraryHistoryPage />)
  await flush()
  return view
}

describe("LibraryHistoryPage", () => {
  beforeEach(() => {
    navigation.reset("/biblioteca/historial?mine=1")
    localStorage.clear()
    vi.mocked(getLibraryHistory).mockReset().mockResolvedValue(history())
  })

  it("lista los períodos terminados y respeta «Solo los míos» de la URL", async () => {
    const { container } = await mountPage()

    expect(getLibraryHistory).toHaveBeenCalledWith({ q: "", faculty: "all", period: "all", mine: true, page: 1 })
    expect(navigation.fullPath).toBe("/biblioteca/historial?mine=1")
    expect([...container.querySelectorAll("thead th")].map((header) => header.textContent)).toEqual(["Período", "Carrera", "Docente", "Firmado por"])
    const row = container.querySelector("tbody tr")!
    expect(row.textContent).toContain("2025-2026")
    expect(row.textContent).toContain("Bibliotecaria Demo")
    fireEvent.click(row)
    expect(navigation.push).toHaveBeenCalledWith("/biblioteca/revisiones/revision-1")
  })

  it("explica cuando el bibliotecario no revisó nada con esos filtros", async () => {
    vi.mocked(getLibraryHistory).mockResolvedValue({ ...history(), reviews: { ...history().reviews, data: [], total: 0, from: null, to: null } })
    const { container } = await mountPage()

    expect(container.textContent).toContain("No hay sílabos revisados por usted con estos filtros")
  })

  it("al quitar los filtros vuelve a toda la biblioteca", async () => {
    const { getByRole, container } = await mountPage()

    fireEvent.click(getByRole("button", { name: "Quitar filtros" }))
    await flush()
    expect(getLibraryHistory).toHaveBeenLastCalledWith({ q: "", faculty: "all", period: "all", mine: false, page: 1 })
    expect(navigation.fullPath).toBe("/biblioteca/historial")
    expect(container.textContent).not.toContain("Quitar filtros")
  })

  it("ordena el historial completo desde el encabezado y lo conserva al recargar", async () => {
    navigation.reset("/biblioteca/historial?mine=1&sort=signed&dir=desc")
    await mountPage()

    expect(getLibraryHistory).toHaveBeenCalledWith({ q: "", faculty: "all", period: "all", mine: true, sort: "signed", dir: "desc", page: 1 })
    expect(screen.getByRole("columnheader", { name: "Firmado por" }).getAttribute("aria-sort")).toBe("descending")

    fireEvent.click(screen.getByRole("button", { name: "Período" }))
    await flush()

    expect(getLibraryHistory).toHaveBeenLastCalledWith({ q: "", faculty: "all", period: "all", mine: true, sort: "period", dir: "asc", page: 1 })
    expect(screen.getByRole("columnheader", { name: "Período" }).getAttribute("aria-sort")).toBe("ascending")
    expect(screen.getByRole("columnheader", { name: "Firmado por" }).hasAttribute("aria-sort")).toBe(false)
    expect(navigation.fullPath).toBe("/biblioteca/historial?mine=1&sort=period&dir=asc")
  })
})
