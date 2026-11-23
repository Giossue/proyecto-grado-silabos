import { fireEvent } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { getTeacherHistoryCareer, type HistorySyllabus } from "@/api/syllabi"
import { SYLLABUS_PREVIEW_KEY } from "@/components/domain/syllabus/syllabusPreview"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"
import TeacherHistoryCareerPage from "./TeacherHistoryCareerPage"

const params = vi.hoisted(() => ({ value: { career: "c1" } as Record<string, string> }))

vi.mock("next/navigation", async () => ({ ...(await import("@/test/nextNavigation")), useParams: () => params.value }))
vi.mock("@/api/syllabi", () => ({ getTeacherHistoryCareer: vi.fn() }))

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
    navigation.reset("/docente/historial/c1")
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

    fireEvent.click(container.querySelector('[aria-label="Abrir sílabo de Redes"]')!)
    expect(navigation.push).toHaveBeenCalledWith("/docente/mis-silabos/s2")
    expect(sessionStorage.getItem(SYLLABUS_PREVIEW_KEY)).toBe("s2")
  })

  it("avisa cuando la carrera no tiene sílabos de períodos anteriores", async () => {
    vi.mocked(getTeacherHistoryCareer).mockResolvedValue({ career: { id: "c1", name: "Software" }, syllabi: [] })
    const { container } = await mountPage()

    expect(container.textContent).toContain("Todavía no tiene sílabos de períodos anteriores en esta carrera")
  })

  it("si la carrera no existe vuelve al historial", async () => {
    vi.mocked(getTeacherHistoryCareer).mockRejectedValue(new ApiError("No encontrado", 404))
    await mountPage()

    expect(navigation.replace).toHaveBeenCalledWith("/docente/historial")
  })
})
