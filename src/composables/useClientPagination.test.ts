import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useClientFilter } from "@/composables/useClientFilter"
import { useClientPagination } from "@/composables/useClientPagination"

const names = Array.from({ length: 45 }, (_, index) => `Materia ${index + 1}`)
const byName = (item: string) => [item]

describe("búsqueda en el navegador", () => {
  it("ignora tildes y mayúsculas", () => {
    const source = ["Matemática", "Física"]
    const { result } = renderHook(() => useClientFilter(source, byName))
    act(() => result.current.setSearch("MATEMATICA"))

    expect(result.current.items).toEqual(["Matemática"])
  })

  it("vuelve a la primera página cuando cambia la búsqueda", () => {
    const { result } = renderHook(() => {
      const filter = useClientFilter(names, byName)
      const pagination = useClientPagination(filter.items, 20, filter.criteria)
      return { filter, pagination }
    })
    act(() => result.current.pagination.setPage(2))
    expect(result.current.pagination.currentPage).toBe(2)
    act(() => result.current.filter.setSearch("Materia 1"))

    expect(result.current.pagination.currentPage).toBe(1)
    expect(result.current.pagination.meta.total).toBe(11)
  })

  it("conserva la página si no se pide reiniciarla", () => {
    const { result, rerender } = renderHook(() => useClientPagination(names))
    act(() => result.current.setPage(2))
    rerender()

    expect(result.current.currentPage).toBe(2)
    expect(result.current.items[0]).toBe("Materia 21")
    expect(result.current.meta).toEqual({ current_page: 2, last_page: 3, per_page: 20, from: 21, to: 40, total: 45 })
  })

  it("filtra por los valores elegidos y «Quitar filtros» vuelve a mostrar todo", () => {
    const source = ["Álgebra", "Física", "Química"]
    const { result } = renderHook(() => useClientFilter(source, byName, { inicial: { matches: (item, value) => item.startsWith(value) } }))
    act(() => result.current.setValue("inicial", "F"))

    expect(result.current.items).toEqual(["Física"])
    expect(result.current.active).toBe(true)
    act(() => result.current.clear())

    expect(result.current.items).toEqual(source)
    expect(result.current.active).toBe(false)
  })
})
