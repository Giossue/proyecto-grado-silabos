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
    expect(screen.getByText("Sin logo")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("row", { name: "Editar Ciencias" }))
    await flush()
    expect(screen.getByRole("dialog").textContent).toContain("Datos registrados")
    expect(document.body.querySelector<HTMLInputElement>("#edit-name-f1")!.value).toBe("Ciencias")

    fireEvent.change(screen.getByLabelText("Buscar facultad"), { target: { value: "sal" } })
    await flush()
    expect(screen.queryByRole("row", { name: "Editar Ciencias" })).toBeNull()
    expect(screen.getByRole("row", { name: "Editar Salud" })).toBeInTheDocument()
  })

  it("muestra la facultad de cada carrera y abre su ficha con Enter", async () => {
    renderWithProviders(<CatalogSection section="careers" catalogs={catalogs} options={options} onChanged={vi.fn()} />)

    const row = screen.getByRole("row", { name: "Editar Software" })
    expect(row.textContent).toContain("Ciencias")
    fireEvent.keyDown(row, { key: "Enter" })
    await flush()
    expect(document.body.querySelector<HTMLInputElement>("#edit-code-c1")!.value).toBe("SW")
  })

  it("el ojo muestra el logo de la facultad", async () => {
    renderWithProviders(<CatalogSection section="faculties" catalogs={catalogs} options={options} onChanged={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Ver logo de Ciencias" }))
    await flush()
    expect(screen.getByRole("dialog").textContent).toContain("Logo de Ciencias")
    expect(screen.getByRole("img", { name: "Logo de Ciencias" })).toHaveAttribute("src", "/logos/f1.png")
  })
})
