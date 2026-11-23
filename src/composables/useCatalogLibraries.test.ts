import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { getCatalogLibraries } from "@/api/libraryCatalog"
import { initialLibraries, librariesToStore, sameLibraries, useCatalogLibraries } from "@/composables/useCatalogLibraries"

vi.mock("@/api/libraryCatalog", () => ({ getCatalogLibraries: vi.fn() }))

const known = [
  { id: "BFCCA", name: "LAGUACOTO" },
  { id: "BGEN", name: "MATRIZ" },
]

describe("useCatalogLibraries", () => {
  beforeEach(() => {
    vi.mocked(getCatalogLibraries).mockReset()
  })

  it("carga las bibliotecas de Koha y devuelve la lista", async () => {
    vi.mocked(getCatalogLibraries).mockResolvedValue(known)
    const { result } = renderHook(() => useCatalogLibraries())
    let loaded: unknown = null
    await act(async () => {
      loaded = await result.current.load()
    })

    expect(loaded).toEqual(known)
    expect(result.current.libraries).toEqual(known)
    expect(result.current.error).toBeNull()
  })

  it("si Koha no responde muestra el error y no hay lista", async () => {
    vi.mocked(getCatalogLibraries).mockRejectedValueOnce(new ApiError("Koha caído", 503))
    const { result } = renderHook(() => useCatalogLibraries())
    await act(async () => {
      await result.current.load()
    })
    expect(result.current.libraries).toBeNull()
    expect(result.current.error).toBe("Koha caído")

    vi.mocked(getCatalogLibraries).mockRejectedValueOnce(new Error("sin red"))
    await act(async () => {
      await result.current.load()
    })
    expect(result.current.error).toBe("No se pudo consultar la lista de bibliotecas")
  })

  it("una lista guardada vacía significa todas, y marcar todas se guarda vacía", () => {
    expect(initialLibraries([], known)).toEqual(["BFCCA", "BGEN"])
    expect(initialLibraries(["BGEN"], known)).toEqual(["BGEN"])
    expect(librariesToStore(["BGEN", "BFCCA"], known)).toEqual([])
    expect(librariesToStore(["BGEN"], known)).toEqual(["BGEN"])
    expect(librariesToStore([], [])).toEqual([])
    expect(sameLibraries(["BGEN", "BFCCA"], ["BFCCA", "BGEN"])).toBe(true)
    expect(sameLibraries(["BGEN"], ["BFCCA"])).toBe(false)
  })
})
