import { fireEvent } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { getTeacherHistory, getTeacherHistoryCareer, type HistorySyllabus } from "@/api/syllabi"
import { SYLLABUS_PREVIEW_KEY } from "@/components/domain/syllabus/syllabusPreview"
import { navigation } from "@/test/nextNavigation"
import { NotFoundBoundary } from "@/test/notFoundBoundary"
import { flush, renderWithProviders } from "@/test/render"
import TeacherHistoryCareerPage from "./TeacherHistoryCareerPage"

const params = vi.hoisted(() => ({ value: { career: "SW" } as Record<string, string> }))

vi.mock("next/navigation", async () => ({ ...(await import("@/test/nextNavigation")), useParams: () => params.value }))
vi.mock("@/api/syllabi", () => ({ getTeacherHistory: vi.fn(), getTeacherHistoryCareer: vi.fn() }))

const syllabus = (overrides: Partial<HistorySyllabus>): HistorySyllabus => ({
  id: "s1", subject: "Álgebra Lineal", period: "2025-2026", state: "aprobado", parallels: ["A"], guardado_en: null, ...overrides,
})

const mountPage = async () => {
  const view = renderWithProviders(<TeacherHistoryCareerPage />)
  await flush()
  return view
}

describe("TeacherHistoryCareerPage", () => {
  beforeEach(() => {
    vi.mocked(getTeacherHistoryCareer).mockReset()
    navigation.reset("/docente/historial/SW")
    vi.mocked(getTeacherHistory).mockReset()
    vi.mocked(getTeacherHistory).mockResolvedValue({ careers: [{ id: "c1", code: "SW", name: "Software", syllabi_count: 2 }] })
    params.value = { career: "SW" }
    sessionStorage.clear()
  })

  it("agrupa los sílabos por período y abre el de la fila como documento", async () => {
    vi.mocked(getTeacherHistoryCareer).mockResolvedValue({
      career: { id: "c1", name: "Software" },
      syllabi: [syllabus({}), syllabus({ id: "s2", subject: "Redes", period: "2024-2025", parallels: ["A", "B"] })],
    })
    const { container } = await mountPage()

    expect(getTeacherHistoryCareer).toHaveBeenCalledWith("c1")
    expect(container.textContent).toContain("Software")
    expect([...container.querySelectorAll("h2")].map((heading) => heading.textContent)).toEqual(["Período 2025-2026", "Período 2024-2025"])
    expect(container.querySelector('[aria-label="Sílabos del período 2024-2025"]')!.textContent).toContain("Sin guardados")

    const link = [...container.querySelectorAll("a")].find((anchor) => anchor.textContent === "Redes")!
    expect(link.getAttribute("href")).toBe("/docente/mis-silabos/s2")
    fireEvent.click(link.closest("tr")!)
    expect(navigation.push).toHaveBeenCalledWith("/docente/mis-silabos/s2")
    expect(sessionStorage.getItem(SYLLABUS_PREVIEW_KEY)).toBe("s2")
  })

  it("ordena dentro de cada período con un único estado compartido y un solo anuncio", async () => {
    vi.mocked(getTeacherHistoryCareer).mockResolvedValue({
      career: { id: "c1", name: "Software" },
      syllabi: [
        syllabus({ id: "s1", subject: "Redes", period: "2025-2026" }),
        syllabus({ id: "s2", subject: "Álgebra Lineal", period: "2025-2026" }),
        syllabus({ id: "s3", subject: "Cálculo", period: "2024-2025" }),
        syllabus({ id: "s4", subject: "Bases de Datos", period: "2024-2025" }),
      ],
    })
    const { container, getAllByRole, getByRole } = await mountPage()
    const subjectsOf = (period: string) => [...container.querySelectorAll(`[aria-label="Sílabos del período ${period}"] tbody a`)].map((link) => link.textContent)

    fireEvent.click(getAllByRole("button", { name: "Asignatura" })[1]!)
    expect([...container.querySelectorAll("h2")].map((heading) => heading.textContent)).toEqual(["Período 2025-2026", "Período 2024-2025"])
    expect(subjectsOf("2025-2026")).toEqual(["Álgebra Lineal", "Redes"])
    expect(subjectsOf("2024-2025")).toEqual(["Bases de Datos", "Cálculo"])
    expect(getAllByRole("columnheader", { name: "Asignatura" }).map((header) => header.getAttribute("aria-sort"))).toEqual(["ascending", "ascending"])
    fireEvent.click(getAllByRole("button", { name: "Asignatura" })[0]!)
    expect(subjectsOf("2025-2026")).toEqual(["Redes", "Álgebra Lineal"])
    expect(subjectsOf("2024-2025")).toEqual(["Cálculo", "Bases de Datos"])
    expect(getByRole("status").textContent).toBe("Ordenado por Asignatura, descendente, 4 filas")
  })

  it("avisa cuando la carrera no tiene sílabos de períodos anteriores", async () => {
    vi.mocked(getTeacherHistoryCareer).mockResolvedValue({ career: { id: "c1", name: "Software" }, syllabi: [] })
    const { container } = await mountPage()

    expect(container.textContent).toContain("Todavía no tiene sílabos de períodos anteriores en esta carrera")
  })

  it.each(["NOPE", "c1"])("con el código desconocido %s muestra 404 sin pedir sus sílabos", async (code) => {
    const silent = vi.spyOn(console, "error").mockImplementation(() => undefined)
    params.value = { career: code }
    const { container } = renderWithProviders(<NotFoundBoundary><TeacherHistoryCareerPage /></NotFoundBoundary>)
    await flush()

    expect(container.querySelector('[data-testid="not-found"]')).not.toBeNull()
    expect(getTeacherHistoryCareer).not.toHaveBeenCalled()
    expect(navigation.replace).not.toHaveBeenCalled()
    silent.mockRestore()
  })

  it("si la API ya no encuentra la carrera muestra 404", async () => {
    const silent = vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.mocked(getTeacherHistoryCareer).mockRejectedValue(new ApiError("No encontrado", 404))
    const { container } = renderWithProviders(<NotFoundBoundary><TeacherHistoryCareerPage /></NotFoundBoundary>)
    await flush(5)

    expect(container.querySelector('[data-testid="not-found"]')).not.toBeNull()
    silent.mockRestore()
  })

  it("mientras busca la carrera muestra el esqueleto, sin 404", async () => {
    vi.mocked(getTeacherHistory).mockImplementation(() => new Promise(() => undefined))
    const { container } = renderWithProviders(<NotFoundBoundary><TeacherHistoryCareerPage /></NotFoundBoundary>)
    await flush()

    expect(container.querySelector('[data-skeleton="page-title"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="not-found"]')).toBeNull()
  })
})
