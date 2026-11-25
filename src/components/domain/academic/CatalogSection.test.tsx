import { fireEvent, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CatalogSection } from "@/components/domain/academic/CatalogSection"
import { flush, renderWithProviders } from "@/test/render"
import type { AcademicStructureProps } from "@/types/academic"

vi.mock("@/api/academic", () => ({ updateAcademicRecord: vi.fn(), setAcademicRecordStatus: vi.fn(), deleteAcademicRecord: vi.fn() }))
vi.mock("@/api/libraryCatalog", () => ({ getCatalogLibraries: vi.fn().mockResolvedValue([]) }))

const catalogs = {
  faculties: [
    { id: "f1", nombre: "Ciencias", activo: true, campus: "Matriz", logo_url: "/logos/f1.png" },
    { id: "f2", nombre: "Salud", activo: false, campus: null, logo_url: null },
  ],
  careers: [
    { id: "c1", faculty_id: "f1", modality: "presencial", modality_label: "Presencial", coordinator: null, campus_name: "Matriz", code: "SW", name: "Software", active: true },
  ],
  periods: [],
} as AcademicStructureProps["catalogs"]
const options = { campusOptions: [{ value: "Matriz", label: "Matriz" }], modalityOptions: [{ value: "presencial", label: "Presencial" }] } as AcademicStructureProps["options"]

describe("CatalogSection", () => {
  it("un clic en la fila de una facultad abre su ficha en solo lectura y la búsqueda filtra por nombre", async () => {
    renderWithProviders(<CatalogSection section="faculties" catalogs={catalogs} options={options} onChanged={vi.fn()} />)

    expect(screen.getByText("Inactiva")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Ciencias" }).closest("tr")!)
    await flush()
    expect(screen.getByRole("dialog").textContent).toContain("Datos registrados")
    expect(document.body.querySelector<HTMLInputElement>("#edit-name-f1")!.value).toBe("Ciencias")

    fireEvent.change(screen.getByLabelText("Buscar facultad"), { target: { value: "sal" } })
    await flush()
    expect(screen.queryByRole("button", { name: "Ciencias" })).toBeNull()
    expect(screen.getByRole("button", { name: "Salud" })).toBeInTheDocument()
  })

  it("muestra la facultad de cada carrera y abre su ficha con el botón de su nombre", async () => {
    renderWithProviders(<CatalogSection section="careers" catalogs={catalogs} options={options} onChanged={vi.fn()} />)

    const name = screen.getByRole("button", { name: "Software" })
    expect(name.closest("tr")!.textContent).toContain("Ciencias")
    expect(name.closest("tr")!.hasAttribute("tabindex")).toBe(false)
    fireEvent.click(name)
    await flush()
    expect(document.body.querySelector<HTMLInputElement>("#edit-code-c1")!.value).toBe("SW")
  })

  it("la tabla de facultades no tiene columna de logo", () => {
    renderWithProviders(<CatalogSection section="faculties" catalogs={catalogs} options={options} onChanged={vi.fn()} />)

    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Facultad", "Campus"])
    expect(screen.queryByText("Sin logo")).toBeNull()
    expect(screen.queryByRole("button", { name: /^Ver logo/ })).toBeNull()
  })

  it("ordena facultades y carreras al pulsar los encabezados y marca aria-sort en esa columna", () => {
    const { unmount } = renderWithProviders(<CatalogSection section="faculties" catalogs={catalogs} options={options} onChanged={vi.fn()} />)
    const facultyRows = () => screen.getAllByRole("row").slice(1).map((row) => row.querySelector("button")!.textContent)

    expect(facultyRows()).toEqual(["Ciencias", "Salud"])
    fireEvent.click(screen.getByRole("button", { name: "Facultad" }))
    fireEvent.click(screen.getByRole("button", { name: "Facultad" }))
    expect(facultyRows()).toEqual(["Salud", "Ciencias"])
    expect(screen.getByRole("columnheader", { name: "Facultad" }).getAttribute("aria-sort")).toBe("descending")
    fireEvent.click(screen.getByRole("button", { name: "Campus" }))
    expect(facultyRows()).toEqual(["Ciencias", "Salud"])
    unmount()

    const careers = { ...catalogs, careers: [...catalogs.careers, { ...catalogs.careers[0]!, id: "c2", faculty_id: "f2", code: "EN", name: "Enfermería" }] }
    renderWithProviders(<CatalogSection section="careers" catalogs={careers} options={options} onChanged={vi.fn()} />)
    const careerRows = () => screen.getAllByRole("row").slice(1).map((row) => row.querySelector("button")!.textContent)

    expect(careerRows()).toEqual(["Software", "Enfermería"])
    fireEvent.click(screen.getByRole("button", { name: "Facultad" }))
    fireEvent.click(screen.getByRole("button", { name: "Facultad" }))
    expect(careerRows()).toEqual(["Enfermería", "Software"])
    expect(screen.getByRole("columnheader", { name: "Facultad" }).getAttribute("aria-sort")).toBe("descending")
    expect(screen.getByRole("columnheader", { name: "Carrera" }).hasAttribute("aria-sort")).toBe(false)
  })
})
