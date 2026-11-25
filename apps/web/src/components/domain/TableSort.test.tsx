import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { SortableHead, SortSelect, SortStatus } from "@/components/domain/TableSort"
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table"
import { useTableSort, type SortColumns } from "@/composables/useTableSort"

type Row = { id: string; name: string; campus: string }

const rows: Row[] = [
  { id: "1", name: "Salud", campus: "Norte" },
  { id: "2", name: "Ciencias", campus: "Matriz" },
]

const columns = {
  name: { label: "Facultad", value: (row: Row) => row.name },
  campus: { label: "Campus", value: (row: Row) => row.campus },
} satisfies SortColumns<Row>

function Probe() {
  const sort = useTableSort(rows, columns)

  return (
    <>
      <SortSelect sort={sort} inputId="sort-probe" />
      <Table label="Facultades">
        <TableHeader>
          <TableRow>
            <SortableHead sort={sort} column="name">Facultad</SortableHead>
            <SortableHead sort={sort} column="campus">Campus</SortableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sort.items.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.name}</TableCell>
              <TableCell>{row.campus}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <SortStatus sort={sort} />
    </>
  )
}

const names = (): string[] => screen.getAllByRole("cell").filter((_, index) => index % 2 === 0).map((cell) => cell.textContent ?? "")

describe("encabezados ordenables", () => {
  it("el botón conserva el nombre de la columna, aria-sort va solo en el encabezado ordenado y el foco se queda en el botón", () => {
    render(<Probe />)
    const button = screen.getByRole("button", { name: "Facultad" })

    expect(button.closest("th")!.hasAttribute("aria-sort")).toBe(false)
    button.focus()
    fireEvent.click(button)

    expect(names()).toEqual(["Ciencias", "Salud"])
    expect(screen.getByRole("columnheader", { name: "Facultad" }).getAttribute("aria-sort")).toBe("ascending")
    expect(screen.getByRole("columnheader", { name: "Campus" }).hasAttribute("aria-sort")).toBe(false)
    expect(document.activeElement).toBe(button)
    expect(screen.getByRole("status").textContent).toBe("Ordenado por Facultad, ascendente, 2 filas")

    fireEvent.click(button)
    expect(names()).toEqual(["Salud", "Ciencias"])
    expect(screen.getByRole("columnheader", { name: "Facultad" }).getAttribute("aria-sort")).toBe("descending")
  })

  it("el selector móvil se etiqueta «Ordenar por» y empieza en el orden predeterminado", () => {
    render(<Probe />)

    expect(screen.getByLabelText("Ordenar por").textContent).toContain("Orden predeterminado")
  })
})
