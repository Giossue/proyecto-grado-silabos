import { act, cleanup, fireEvent, render } from "@testing-library/react"
import type { ComponentType, ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { searchLibraryCatalog, type CatalogBook } from "@/api/libraryCatalog"
import { LibraryCatalogSearch } from "@/components/domain/syllabus/LibraryCatalogSearch"
import { catalogResults } from "@/test/libraryCatalog"
import { flush } from "@/test/render"

const fading = vi.hoisted(() => ({ enabled: false, change: null as ((open: boolean) => void) | null }))

vi.mock("@/api/libraryCatalog", () => ({ searchLibraryCatalog: vi.fn() }))
vi.mock("@/components/ui/dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/dialog")>()
  const passthrough = <P extends { children?: ReactNode },>(Original: ComponentType<P>) =>
    function Passthrough(props: P) {
      return fading.enabled ? <div>{props.children}</div> : <Original {...props} />
    }
  function Dialog(props: { open?: boolean; onOpenChange?: (open: boolean) => void; children?: ReactNode }) {
    if (!fading.enabled) return <actual.Dialog {...props} />
    fading.change = props.onOpenChange ?? null
    return <div data-modal data-state={props.open ? "open" : "closed"}>{props.children}</div>
  }

  return {
    ...actual,
    Dialog,
    DialogContent: passthrough(actual.DialogContent),
    DialogHeader: passthrough(actual.DialogHeader),
    DialogTitle: passthrough(actual.DialogTitle),
    DialogDescription: passthrough(actual.DialogDescription),
    DialogFooter: passthrough(actual.DialogFooter),
    DialogClose: passthrough(actual.DialogClose),
    DialogTrigger: passthrough(actual.DialogTrigger),
  }
})

const search = vi.mocked(searchLibraryCatalog)

const book: CatalogBook = { id: "10525", title: "Proyectos de inversión", author: "Sapag Chain, Nassir", year: "2011", place: "Santiago de Chile", publisher: "Pearson Educación", isbn: "9789563431063", call_number: "658.404 S2411p", format: "Libro físico", kind: "Libro" }
const body = (): HTMLElement => document.body
const buttonWith = (text: string): HTMLButtonElement => [...body().querySelectorAll("button")].find((item) => item.textContent?.includes(text)) as HTMLButtonElement
const open = async (disabled = false, onPick = vi.fn()) => {
  const view = render(<LibraryCatalogSearch disabled={disabled} onPick={onPick} />)
  fireEvent.click(buttonWith("Buscar en la biblioteca"))
  await flush()

  return { ...view, onPick }
}
const searchFor = async (text: string): Promise<void> => {
  fireEvent.change(body().querySelector<HTMLInputElement>('[aria-label="Texto a buscar"]')!, { target: { value: text } })
  await flush()
  fireEvent.submit(body().querySelector<HTMLFormElement>("form")!)
  await flush()
}

describe("búsqueda en la biblioteca", () => {
  beforeEach(() => search.mockReset())
  afterEach(() => {
    fading.enabled = false
    fading.change = null
    cleanup()
    document.body.innerHTML = ""
  })

  it("busca por el campo elegido y entrega el libro que se agrega", async () => {
    search.mockResolvedValue(catalogResults([book]))
    const { onPick } = await open()
    fireEvent.change(body().querySelector<HTMLSelectElement>('[aria-label="Buscar por"]')!, { target: { value: "author" } })
    await flush()

    await searchFor("Sapag")

    expect(search).toHaveBeenCalledWith("author", "Sapag", 1)
    expect(body().textContent).toContain("Proyectos de inversión")
    expect([...body().querySelectorAll("th")].map((item) => item.textContent?.trim())).toEqual(["Autor", "Título", "Tipo", "Año", "Ciudad", "Editorial", "ISBN", "Código", "Agregar"])
    expect([...body().querySelectorAll("tbody td")].map((item) => item.textContent?.trim()).slice(0, 8)).toEqual(["Sapag Chain, Nassir", "Proyectos de inversión", "Libro", "2011", "Santiago de Chile", "Pearson Educación", "9789563431063", "Libro físico"])
    fireEvent.click(buttonWith("Agregar"))
    await flush()
    expect(onPick.mock.calls).toEqual([[book]])
    expect(buttonWith("Agregado").disabled).toBe(true)
  })

  it("avisa cuando no hay resultados", async () => {
    search.mockResolvedValue(catalogResults([]))
    await open()

    await searchFor("nada")

    expect(body().querySelector("tbody")!.textContent).toContain("No hay resultados")
  })

  it("no busca con menos de dos letras", async () => {
    await open()

    await searchFor("a")

    expect(search).not.toHaveBeenCalled()
    expect(body().querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true)
  })

  it("el botón se deshabilita cuando ya no caben más libros", () => {
    render(<LibraryCatalogSearch disabled onPick={vi.fn()} />)

    expect(buttonWith("Buscar en la biblioteca").disabled).toBe(true)
  })

  it("se cierra con el botón Cerrar y la próxima vez abre limpio", async () => {
    search.mockResolvedValue(catalogResults([book]))
    await open()
    await searchFor("Sapag")
    expect(body().textContent).toContain("Proyectos de inversión")

    fireEvent.click(buttonWith("Cerrar"))
    await flush()
    expect(buttonWith("Cerrar")).toBeUndefined()

    fireEvent.click(buttonWith("Buscar en la biblioteca"))
    await flush()
    expect(body().querySelector<HTMLInputElement>('[aria-label="Texto a buscar"]')!.value).toBe("")
    expect(body().querySelector("table")).toBeNull()
  })

  describe("páginas", () => {
    const pageButton = (label: string): HTMLButtonElement => body().querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!

    it("con más de 20 libros muestra la paginación y pide la página elegida con la misma búsqueda", async () => {
      search.mockResolvedValue(catalogResults(Array.from({ length: 20 }, (_, index) => ({ ...book, id: String(index) })), 45))
      await open()
      await searchFor("Sapag")
      expect(body().textContent).toContain("1–20 de 45")

      search.mockResolvedValue(catalogResults([{ ...book, id: "99", title: "Libro de la página 3" }], 45, 3))
      fireEvent.click(pageButton("Ir a la página 3"))
      await flush()

      expect(search).toHaveBeenLastCalledWith("any", "Sapag", 3)
      expect(body().textContent).toContain("Libro de la página 3")
      expect(body().textContent).toContain("41–41 de 45")
    })

    it("sigue con la búsqueda que se hizo aunque se cambie el texto sin buscar", async () => {
      search.mockResolvedValue(catalogResults(Array.from({ length: 20 }, (_, index) => ({ ...book, id: String(index) })), 45))
      await open()
      await searchFor("Sapag")
      fireEvent.change(body().querySelector<HTMLInputElement>('[aria-label="Texto a buscar"]')!, { target: { value: "otra cosa" } })
      await flush()

      fireEvent.click(pageButton("Ir a la página 2"))
      await flush()

      expect(search).toHaveBeenLastCalledWith("any", "Sapag", 2)
    })

    it("una búsqueda nueva vuelve a la página 1 y sin resultados la paginación dice 0–0 de 0", async () => {
      search.mockResolvedValue(catalogResults(Array.from({ length: 20 }, (_, index) => ({ ...book, id: String(index) })), 45))
      await open()
      await searchFor("Sapag")
      search.mockResolvedValue(catalogResults([]))

      await searchFor("nada")

      expect(search).toHaveBeenLastCalledWith("any", "nada", 1)
      expect(body().querySelector('[aria-label="Paginación de los libros"]')).not.toBeNull()
      expect(body().textContent).toContain("0–0 de 0")
    })
  })

  it("al cerrar conserva la búsqueda mientras se desvanece y la limpia al volver a abrir", async () => {
    fading.enabled = true
    search.mockResolvedValue(catalogResults([book]))
    const { container } = render(<LibraryCatalogSearch onPick={vi.fn()} />)
    const modal = (): Element => container.querySelector("[data-modal]")!
    act(() => fading.change?.(true))
    await flush()
    await searchFor("Sapag")
    act(() => fading.change?.(false))
    await flush()

    expect(modal().getAttribute("data-state")).toBe("closed")
    expect(body().querySelector<HTMLInputElement>('[aria-label="Texto a buscar"]')!.value).toBe("Sapag")
    expect(body().textContent).toContain("Proyectos de inversión")
    act(() => fading.change?.(true))
    await flush()
    expect(body().querySelector<HTMLInputElement>('[aria-label="Texto a buscar"]')!.value).toBe("")
    expect(body().textContent).not.toContain("Proyectos de inversión")
  })
})
