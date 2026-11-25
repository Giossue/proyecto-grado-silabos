import { fireEvent, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { getConvocation } from "@/api/convocations"
import { ConvocationTrackingTable } from "@/components/domain/syllabus/ConvocationTrackingTable"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/convocations", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/convocations")>()), getConvocation: vi.fn() }))

const syllabus = (id: string, subject: string, state: string, parallels: string[]) => ({
  id, subject, code: `C-${id}`, state, stage: null, revision_id: null, returned_by: null, iniciado_en: null, parallels, teachers: ["Docente"],
})

describe("ConvocationTrackingTable", () => {
  it("ordena por asignatura, primer paralelo y estado visible al pulsar los encabezados", async () => {
    vi.mocked(getConvocation).mockResolvedValue({
      convocation: { syllabi: [syllabus("1", "Redes", "borrador", ["B"]), syllabus("2", "Álgebra", "aprobado", ["C", "A"]), syllabus("3", "Bases de datos", "sin_iniciar", ["A"])] },
    } as unknown as Awaited<ReturnType<typeof getConvocation>>)
    renderWithProviders(<ConvocationTrackingTable convocationId="conv-1" />)
    await flush()
    const subjects = () => [...document.body.querySelectorAll("tbody tr td:first-child > div:first-child")].map((cell) => cell.textContent)

    expect(subjects()).toEqual(["Redes", "Álgebra", "Bases de datos"])
    fireEvent.click(screen.getByRole("button", { name: "Asignatura" }))
    expect(subjects()).toEqual(["Álgebra", "Bases de datos", "Redes"])
    expect(screen.getByRole("columnheader", { name: "Asignatura" }).getAttribute("aria-sort")).toBe("ascending")
    fireEvent.click(screen.getByRole("button", { name: "Paralelos y docentes" }))
    expect(subjects()).toEqual(["Bases de datos", "Redes", "Álgebra"])
    fireEvent.click(screen.getByRole("button", { name: "Estado" }))
    expect(subjects()).toEqual(["Álgebra", "Redes", "Bases de datos"])
    expect(screen.getByRole("columnheader", { name: "Estado" }).getAttribute("aria-sort")).toBe("ascending")
    expect(screen.getByRole("columnheader", { name: "Asignatura" }).hasAttribute("aria-sort")).toBe(false)
    expect(screen.getByRole("status").textContent).toBe("Ordenado por Estado, ascendente, 3 filas")
  })
})
