import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useTableSort, type SortColumns } from "@/composables/useTableSort"

type Row = { id: string; name: string; code: string; cycle: number | null; sentAt: string | null }

const rows: Row[] = [
  { id: "1", name: "Ñandú", code: "SW-10", cycle: 3, sentAt: "2026-11-20T10:00:00Z" },
  { id: "2", name: "álgebra", code: "SW-9", cycle: null, sentAt: "2026-11-21T10:00:00Z" },
  { id: "3", name: "Biología", code: "SW-2", cycle: 10, sentAt: null },
]

const columns: SortColumns<Row> = {
  name: { label: "Materia", value: (row) => row.name },
  code: { label: "Código", value: (row) => row.code },
  cycle: { label: "Ciclo", type: "number", value: (row) => row.cycle },
  sentAt: { label: "Enviado", type: "date", value: (row) => row.sentAt },
}

const ids = (items: Row[]): string => items.map((row) => row.id).join(",")

describe("useTableSort", () => {
  it("conserva el orden recibido hasta que se elige una columna", () => {
    const { result } = renderHook(() => useTableSort(rows, columns))

    expect(ids(result.current.items)).toBe("1,2,3")
    expect(result.current.headProps("name")["aria-sort"]).toBeUndefined()
    expect(result.current.announcement).toBe("")
  })

  it("el primer clic ordena ascendente, el segundo invierte y cambiar de columna vuelve a ascendente", () => {
    const { result } = renderHook(() => useTableSort(rows, columns))

    act(() => result.current.sortBy("name"))
    expect(ids(result.current.items)).toBe("2,3,1")
    expect(result.current.headProps("name")["aria-sort"]).toBe("ascending")
    expect(result.current.headProps("code")["aria-sort"]).toBeUndefined()
    expect(result.current.announcement).toBe("Ordenado por Materia, ascendente, 3 filas")

    act(() => result.current.sortBy("name"))
    expect(ids(result.current.items)).toBe("1,3,2")
    expect(result.current.headProps("name")["aria-sort"]).toBe("descending")

    act(() => result.current.sortBy("code"))
    expect(result.current.headProps("code")["aria-sort"]).toBe("ascending")
    expect(result.current.headProps("name")["aria-sort"]).toBeUndefined()
  })

  it("compara textos con números dentro como números y sin distinguir tildes ni mayúsculas", () => {
    const { result } = renderHook(() => useTableSort(rows, columns))

    act(() => result.current.sortBy("code"))
    expect(result.current.items.map((row) => row.code)).toEqual(["SW-2", "SW-9", "SW-10"])
  })

  it("ordena números y fechas por su valor y deja los vacíos al final en ambos sentidos", () => {
    const { result } = renderHook(() => useTableSort(rows, columns))

    act(() => result.current.sortBy("cycle"))
    expect(ids(result.current.items)).toBe("1,3,2")
    act(() => result.current.sortBy("cycle"))
    expect(ids(result.current.items)).toBe("3,1,2")

    act(() => result.current.sortBy("sentAt"))
    expect(ids(result.current.items)).toBe("1,2,3")
    act(() => result.current.sortBy("sentAt"))
    expect(ids(result.current.items)).toBe("2,1,3")
  })

  it("ofrece las opciones del selector móvil y vuelve al orden predeterminado", () => {
    const { result } = renderHook(() => useTableSort(rows, columns))

    expect(result.current.options.map((option) => option.label)).toEqual([
      "Orden predeterminado",
      "Materia: A a Z",
      "Materia: Z a A",
      "Código: A a Z",
      "Código: Z a A",
      "Ciclo: de menor a mayor",
      "Ciclo: de mayor a menor",
      "Enviado: más antiguo primero",
      "Enviado: más reciente primero",
    ])

    act(() => result.current.choose("cycle:descending"))
    expect(result.current.selected).toBe("cycle:descending")
    expect(ids(result.current.items)).toBe("3,1,2")

    act(() => result.current.choose("default"))
    expect(result.current.selected).toBe("default")
    expect(ids(result.current.items)).toBe("1,2,3")
  })

  it("anuncia una sola fila en singular", () => {
    const { result } = renderHook(() => useTableSort(rows.slice(0, 1), columns))

    act(() => result.current.sortBy("name"))
    expect(result.current.announcement).toBe("Ordenado por Materia, ascendente, 1 fila")
  })
})
