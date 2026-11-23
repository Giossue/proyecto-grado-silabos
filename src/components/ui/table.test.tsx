import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

describe("TableRow", () => {
  afterEach(cleanup)

  it("solo trata como casilla de la tarjeta a la primera celda con casilla y sin encabezado", () => {
    const { container } = render(
      <Table label="Materias">
        <TableHeader>
          <TableRow>
            <TableHead />
            <TableHead>Materia</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>
              <input type="checkbox" aria-label="Seleccionar la materia" />
            </TableCell>
            <TableCell>Álgebra Lineal</TableCell>
            <TableCell data-card-span="full">
              <input type="checkbox" aria-label="Seleccionar el paralelo" />
              Paralelo A
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )

    const cells = Array.from(container.querySelectorAll("tbody td"))

    expect(cells.map((cell) => cell.getAttribute("data-card-role"))).toEqual([
      "select",
      "title",
      "data",
    ])
    expect(cells[2]).toHaveAttribute("data-card-wide", "true")
  })

  it("una celda marcada no lleva etiqueta en la tarjeta y las demás conservan su encabezado", () => {
    const { container } = render(
      <Table label="Expedientes">
        <TableHeader>
          <TableRow>
            <TableHead>Materia</TableHead>
            <TableHead>Docente</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Álgebra Lineal</TableCell>
            <TableCell>Ana Pérez</TableCell>
            <TableCell data-card-no-label="true">Aprobado</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )

    expect(
      Array.from(container.querySelectorAll("tbody td")).map((cell) =>
        cell.getAttribute("data-label")
      )
    ).toEqual(["", "Docente", ""])
  })
})
