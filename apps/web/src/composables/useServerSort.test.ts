import { act, renderHook } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { NO_SORT, serverSortOf, useServerSort, type ServerSortState } from "@/composables/useServerSort"

const columns = {
  name: { label: "Usuario" },
  sent: { label: "Enviado", type: "date" as const },
}

const useSorted = (initial: ServerSortState, total = 42, onChoose?: (next: ServerSortState) => void) => {
  const [value, setValue] = useState(initial)
  const sort = useServerSort({ columns, value, total, onSort: setValue, onChoose })

  return { sort, value }
}

describe("useServerSort", () => {
  it("sin orden elegido no marca columnas ni anuncia nada", () => {
    const { result } = renderHook(() => useSorted(NO_SORT))

    expect(result.current.sort.sortKey).toBeNull()
    expect(result.current.sort.headProps("name")).toEqual({})
    expect(result.current.sort.selected).toBe("default")
    expect(result.current.sort.announcement).toBe("")
  })

  it("el primer clic ordena ascendente, el segundo invierte y cambiar de columna vuelve a ascendente", () => {
    const { result } = renderHook(() => useSorted(NO_SORT))

    act(() => result.current.sort.sortBy("name"))
    expect(result.current.value).toEqual({ sort: "name", dir: "asc" })
    expect(result.current.sort.headProps("name")).toEqual({ "aria-sort": "ascending" })
    expect(result.current.sort.headProps("sent")).toEqual({})
    expect(result.current.sort.announcement).toBe("Ordenado por Usuario, ascendente, 42 filas")

    act(() => result.current.sort.sortBy("name"))
    expect(result.current.value).toEqual({ sort: "name", dir: "desc" })
    expect(result.current.sort.headProps("name")).toEqual({ "aria-sort": "descending" })
    expect(result.current.sort.announcement).toBe("Ordenado por Usuario, descendente, 42 filas")

    act(() => result.current.sort.sortBy("sent"))
    expect(result.current.value).toEqual({ sort: "sent", dir: "asc" })
  })

  it("el selector elige columna y sentido o vuelve al orden predeterminado", () => {
    const onChoose = vi.fn()
    const { result } = renderHook(() => useSorted({ sort: "sent", dir: "desc" }, 1, onChoose))

    expect(result.current.sort.selected).toBe("sent:descending")
    expect(result.current.sort.announcement).toBe("Ordenado por Enviado, descendente, 1 fila")
    expect(result.current.sort.options.map((option) => option.label)).toEqual([
      "Orden predeterminado",
      "Usuario: A a Z",
      "Usuario: Z a A",
      "Enviado: más antiguo primero",
      "Enviado: más reciente primero",
    ])

    act(() => result.current.sort.choose("name:descending"))
    act(() => result.current.sort.choose("default"))
    act(() => result.current.sort.choose("other:ascending"))
    expect(onChoose.mock.calls).toEqual([[{ sort: "name", dir: "desc" }], [NO_SORT]])
  })

  it("descarta columnas que no están en la lista blanca", () => {
    expect(serverSortOf(columns, "name", "desc")).toEqual({ sort: "name", dir: "desc" })
    expect(serverSortOf(columns, "name", "sideways")).toEqual({ sort: "name", dir: "asc" })
    expect(serverSortOf(columns, "password", "asc")).toEqual(NO_SORT)
    expect(serverSortOf(columns, "toString", "asc")).toEqual(NO_SORT)
  })
})
