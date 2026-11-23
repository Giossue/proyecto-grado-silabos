import { fireEvent } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { getDashboard } from "@/api/dashboard"
import { getLibraryReviews, type LibraryReviewsPage as ReviewsPayload } from "@/api/library"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"
import LibraryReviewsPage from "./LibraryReviewsPage"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/dashboard", () => ({ getDashboard: vi.fn() }))
vi.mock("@/api/library", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/library")>()),
  getLibraryReviews: vi.fn(),
}))

const page = (): ReviewsPayload => ({
  filters: { state: "pendiente", q: null },
  reviews: {
    data: [{
      revision_id: "revision-2",
      syllabus_id: "syllabus-1",
      subject: "Arquitectura de Software",
      code: "SW-601",
      career: "Software",
      period: "2026-2027",
      parallels: ["A", "B"],
      teachers: ["Docente Demo"],
      revision_number: 2,
      sent_at: "2026-09-28T10:00:00-05:00",
      sent_by: "Docente Demo",
      state: "atendido",
      outcome: "devuelto",
    }],
    current_page: 1,
    last_page: 1,
    per_page: 20,
    from: 1,
    to: 1,
    total: 1,
  },
})

const mountPage = async () => {
  const view = renderWithProviders(<LibraryReviewsPage />)
  await flush()
  return view
}

describe("LibraryReviewsPage", () => {
  beforeEach(() => {
    navigation.reset("/biblioteca/revisiones?state=pendiente")
    vi.mocked(getLibraryReviews).mockReset()
    vi.mocked(getDashboard).mockReset()
    vi.mocked(getDashboard).mockResolvedValue({
      metrics: [
        { key: "library_pending", label: "En revisión", value: 2, suffix: null, hint: "Enviados por los docentes; falta verificar la bibliografía" },
        { key: "library_signed", label: "Firmados", value: 3, suffix: null, hint: "Bibliografía aprobada y firmada" },
        { key: "library_commented", label: "Corrección solicitada", value: 1, suffix: null, hint: "Con observaciones para el docente" },
      ],
      setup: null,
      deadline: { period: "2026-2027", starts_at: "2026-10-01", due_at: "2026-11-15", state: "active", days_until_start: 0, days_until_due: 19, convocation_id: null, paused_by: null, classes_ended: false, career_pending: false },
      coordination_convocation: null,
    })
  })
  afterEach(() => {
    localStorage.clear()
  })

  it("muestra arriba los tres indicadores de Biblioteca y no los vuelve a pedir al filtrar", async () => {
    vi.mocked(getLibraryReviews).mockResolvedValue(page())
    const { container } = await mountPage()

    expect(container.textContent).toContain("En revisión")
    expect(container.textContent).toContain("Firmados")
    expect(container.textContent).toContain("Corrección solicitada")

    fireEvent.submit(container.querySelector("form")!)
    await flush()
    expect(getDashboard).toHaveBeenCalledTimes(1)
    expect(getLibraryReviews).toHaveBeenCalledTimes(2)
  })

  it("carga la bandeja con el filtro de la URL y nombra los estados de biblioteca", async () => {
    vi.mocked(getLibraryReviews).mockResolvedValue(page())
    const { container } = await mountPage()

    expect(getLibraryReviews).toHaveBeenCalledWith({ q: "", state: "pendiente", faculty: "all", page: 1 })
    expect(navigation.fullPath).toBe("/biblioteca/revisiones?state=pendiente")
    const row = container.querySelectorAll("tbody tr")[0]!
    const headers = [...container.querySelectorAll("thead th")].map((header) => header.textContent)
    expect(container.querySelector("#library-search")!.getAttribute("placeholder")).toBe("Buscar por asignatura, código, carrera o docente")
    expect(headers).toEqual(["Facultad", "Carrera", "Asignatura", "Responsable", "Estado"])
    expect(row.textContent).not.toContain("SW-601")
    expect(row.textContent).toContain("Arquitectura de Software")
    expect(row.textContent).toContain("Sin asignar")
    expect(row.textContent).not.toContain("A, B")
    expect(container.querySelector("h1")!.textContent).toBe("Revisiones de biblioteca - Período 2026-2027")
    const badge = container.querySelector('[data-slot="badge"]')
    expect(badge !== null && badge.textContent!.startsWith("Período")).toBe(false)
    expect(row.textContent).not.toContain("N.º")
    expect(row.textContent).toContain("Corrección solicitada")
    expect(container.querySelector('[aria-label="Historial"]')!.getAttribute("href")).toBe("/biblioteca/historial")

    fireEvent.click(row)
    expect(navigation.push).toHaveBeenCalledWith("/biblioteca/revisiones/revision-2")
  })

  it("recuerda la facultad que cada bibliotecario eligió y la usa al volver", async () => {
    vi.mocked(getLibraryReviews).mockResolvedValue({ ...page(), faculties: [{ id: "f1", name: "Ciencias Administrativas" }, { id: "f2", name: "Ciencias de la Salud" }] })
    localStorage.setItem("silabos:biblioteca:facultad:", "f2")
    const { container } = await mountPage()

    expect(getLibraryReviews).toHaveBeenCalledWith({ q: "", state: "pendiente", faculty: "f2", page: 1 })
    expect(navigation.fullPath).toBe("/biblioteca/revisiones?state=pendiente&faculty=f2")
    expect(container.textContent).toContain("Ciencias de la Salud")
  })

  it("si la facultad guardada ya no existe, vuelve a todas", async () => {
    localStorage.setItem("silabos:biblioteca:facultad:", "retirada")
    vi.mocked(getLibraryReviews).mockRejectedValueOnce(new ApiError("La facultad seleccionada no es válida.", 422)).mockResolvedValue(page())
    const { container } = await mountPage()

    expect(getLibraryReviews).toHaveBeenLastCalledWith({ q: "", state: "pendiente", faculty: "all", page: 1 })
    expect(localStorage.getItem("silabos:biblioteca:facultad:")).toBeNull()
    expect(container.textContent).not.toContain("no es válida")
  })
})
