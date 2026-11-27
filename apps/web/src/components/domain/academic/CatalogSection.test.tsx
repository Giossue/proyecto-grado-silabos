import { fireEvent, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { CatalogSection } from "@/components/domain/academic/CatalogSection"
import { flush, renderWithProviders } from "@/test/render"
import type { AcademicStructureProps } from "@/types/academic"

vi.mock("@/api/academic", () => ({ updateAcademicRecord: vi.fn(), setAcademicRecordStatus: vi.fn(), deleteAcademicRecord: vi.fn() }))
vi.mock("@/api/libraryCatalog", () => ({ getCatalogLibraries: vi.fn().mockResolvedValue([]) }))

const catalogs = {
  faculties: [
    { id: "f1", nombre: "Ciencias", activo: true, logo_url: "/logos/f1.png" },
    { id: "f2", nombre: "Salud", activo: false, logo_url: null },
  ],
  careers: [
    { id: "c1", faculty_id: "f1", modality: "presencial", modality_label: "Presencial", coordinator: null, code: "SW", name: "Software", cycle_count: 9, active: true },
  ],
  periods: [],
} as AcademicStructureProps["catalogs"]
const options = { modalityOptions: [{ value: "presencial", label: "Presencial" }] } as AcademicStructureProps["options"]

type Catalogs = AcademicStructureProps["catalogs"]

const renderTable = (value: Catalogs = catalogs) => renderWithProviders(<CatalogSection catalogs={value} options={options} onChanged={vi.fn()} />)
const cellsOf = (row: HTMLElement): HTMLTableCellElement[] => [...row.querySelectorAll("td")]
// [career, faculty] of every body row
const table = (): string[][] =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => cellsOf(row).slice(0, 2).map((cell) => cell.querySelector("button")?.textContent ?? cell.textContent!))
const facultyField = (id: string) => document.body.querySelector<HTMLInputElement>(`#edit-name-${id}`)
const careerField = () => document.body.querySelector<HTMLInputElement>("#edit-code-c1")

describe("CatalogSection", () => {
  it("una sola tabla muestra cada carrera con su facultad, y las facultades sin carreras con «Sin carreras»", () => {
    renderTable()

    expect(table()).toEqual([["Software", "Ciencias"], ["Sin carreras", "Salud"]])
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Carrera", "Facultad", "Modalidad", "Ciclos", "Trabajo de la carrera"])
    const alone = cellsOf(screen.getAllByRole("row")[2]!)
    expect(alone[1]!.textContent).toContain("Inactiva")
    expect(alone.slice(2, 4).map((cell) => cell.textContent)).toEqual(["—", "—"])
    expect(document.body.textContent).not.toMatch(/campus/i)
  })

  it("el nombre de la facultad abre su ficha, una sola aunque tenga varias carreras", async () => {
    const twice = { ...catalogs, careers: [...catalogs.careers, { ...catalogs.careers[0]!, id: "c2", code: "RD", name: "Redes" }] } as Catalogs
    renderTable(twice)

    fireEvent.click(screen.getAllByRole("button", { name: "Ciencias" })[0]!)
    await flush()

    expect(screen.getAllByRole("dialog")).toHaveLength(1)
    expect(facultyField("f1")!.value).toBe("Ciencias")
    expect(careerField()).toBeNull()
  })

  it("la fila de una facultad sin carreras abre la ficha de la facultad", async () => {
    renderTable()

    fireEvent.click(screen.getByText("Sin carreras").closest("tr")!)
    await flush()

    expect(screen.getByRole("dialog").textContent).toContain("Datos registrados")
    expect(facultyField("f2")!.value).toBe("Salud")
  })

  it("la fila de una carrera abre la ficha de la carrera, no la de su facultad", async () => {
    renderTable()
    const name = screen.getByRole("button", { name: "Software" })
    expect(name.closest("tr")!.hasAttribute("tabindex")).toBe(false)

    fireEvent.click(name.closest("tr")!)
    await flush()

    expect(careerField()!.value).toBe("SW")
    expect(facultyField("f1")).toBeNull()
  })

  it("busca por carrera o por facultad, y el filtro de modalidad deja solo carreras", async () => {
    const actor = userEvent.setup()
    renderTable()
    const search = screen.getByLabelText("Buscar carrera o facultad")

    fireEvent.change(search, { target: { value: "sal" } })
    await flush()
    expect(table()).toEqual([["Sin carreras", "Salud"]])

    fireEvent.change(search, { target: { value: "soft" } })
    await flush()
    expect(table()).toEqual([["Software", "Ciencias"]])

    fireEvent.change(search, { target: { value: "" } })
    await flush()
    await actor.click(screen.getByRole("combobox", { name: "Modalidad" }))
    await actor.click(screen.getByRole("option", { name: "Presencial" }))
    await flush()
    expect(table()).toEqual([["Software", "Ciencias"]])
  })

  it("ordena al pulsar los encabezados, marca aria-sort y deja al final las filas sin carrera al ordenar por carrera", () => {
    const more = {
      ...catalogs,
      careers: [...catalogs.careers, { ...catalogs.careers[0]!, id: "c2", faculty_id: "f3", code: "EN", name: "Enfermería" }],
      faculties: [...catalogs.faculties, { id: "f3", nombre: "Zootecnia", activo: true, logo_url: null }],
    } as Catalogs
    renderTable(more)

    fireEvent.click(screen.getByRole("button", { name: "Carrera" }))
    expect(table().map(([career]) => career)).toEqual(["Enfermería", "Software", "Sin carreras"])
    fireEvent.click(screen.getByRole("button", { name: "Carrera" }))
    expect(table().map(([career]) => career)).toEqual(["Software", "Enfermería", "Sin carreras"])

    fireEvent.click(screen.getByRole("button", { name: "Facultad" }))
    expect(table().map(([, faculty]) => faculty)).toEqual(["Ciencias", "Salud", "Zootecnia"])
    expect(screen.getByRole("columnheader", { name: "Facultad" }).getAttribute("aria-sort")).toBe("ascending")
    expect(screen.getByRole("columnheader", { name: "Carrera" }).hasAttribute("aria-sort")).toBe(false)
  })

  it("muestra los ciclos de la malla vigente de cada carrera", () => {
    const withoutVigente = { ...catalogs, careers: [...catalogs.careers, { ...catalogs.careers[0], id: "c2", code: "RD", name: "Redes", cycle_count: null }] } as AcademicStructureProps["catalogs"]
    renderWithProviders(<CatalogSection catalogs={withoutVigente} options={options} onChanged={vi.fn()} />)

    expect(screen.getByRole("columnheader", { name: "Ciclos" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Software" }).closest("tr")!.textContent).toContain("9")
    expect(screen.getByRole("button", { name: "Redes" }).closest("tr")!.textContent).toContain("Sin malla vigente")
  })

  it("cada carrera activa ofrece un solo botón que abre su trabajo en la pestaña Malla", () => {
    const withInactive = { ...catalogs, careers: [...catalogs.careers, { ...catalogs.careers[0], id: "c2", code: "RD", name: "Redes", active: false }] } as AcademicStructureProps["catalogs"]
    renderWithProviders(<CatalogSection catalogs={withInactive} options={options} onChanged={vi.fn()} />)

    expect(screen.getAllByRole("link").map((link) => link.getAttribute("aria-label"))).toEqual(["Abrir carrera Software"])
    expect(screen.getByRole("link", { name: "Abrir carrera Software" }).getAttribute("href")).toBe(`/admin/carreras/${catalogs.careers[0]!.code.toLowerCase()}/malla`)
  })
})
