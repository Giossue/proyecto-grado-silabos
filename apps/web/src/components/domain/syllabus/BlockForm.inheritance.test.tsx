import { fireEvent } from "@testing-library/react"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { searchLibraryCatalog } from "@/api/libraryCatalog"
import { BlockForm } from "@/components/domain/syllabus/BlockForm"
import { DocumentBlockContent } from "@/components/domain/syllabus/DocumentBlockContent"
import { addCatalogBook, canAddCatalogBook } from "@/lib/blocks/catalog"
import { setTemplateRuntime } from "@/lib/blocks/runtime"
import type { BlockDefinition, TemplateDefinitionPayload } from "@silabos/shared/lib/blocks/types"
import { flush, renderWithProviders as render } from "@/test/render"

vi.mock("@/api/libraryCatalog", () => ({ searchLibraryCatalog: vi.fn() }))

type Row = Record<string, string>

const block = (rowIds: boolean): BlockDefinition => ({
  label: "Origen",
  props: {},
  value: {
    temas: {
      type: "array",
      title: "tema",
      minItems: 0,
      maxItems: 3,
      initial: 0,
      ...(rowIds ? { row_ids: true } : {}),
      items: { type: "object", properties: { resultado: { type: "string", title: "Resultado", maxLength: 100, multiline: false } } },
    },
  },
  rules: [],
  catalog: { list: "temas", map: { title: "resultado" } },
  layout: [
    {
      type: "table",
      content: [{ type: "tableRow", attrs: { repeat: { value: "temas" } }, content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "slot", attrs: { value: "resultado" } }] }] }] }],
    },
  ] as unknown as BlockDefinition["layout"],
})

const runtime = (rowIds: boolean): void => setTemplateRuntime({ blocks: { origen: block(rowIds) } } as unknown as TemplateDefinitionPayload, {})
const buttons = (name: string): HTMLButtonElement[] => [...document.body.querySelectorAll("button")].filter((button) => (button.getAttribute("aria-label") ?? button.textContent ?? "").startsWith(name))
const press = async (name: string, position = 0): Promise<void> => {
  fireEvent.click(buttons(name)[position]!)
  await flush()
}

function mount(Component: "form" | "document", initial: Row[]) {
  let current: Row[] = initial
  function Harness() {
    const [value, setValue] = useState<Record<string, unknown>>({ temas: initial })
    const change = (next: Record<string, unknown>): void => {
      current = next.temas as Row[]
      setValue(next)
    }
    return Component === "form" ? (
      <BlockForm id="b" kind="origen" blockProps={{}} value={value} onValueChange={change} />
    ) : (
      <DocumentBlockContent kind="origen" blockProps={{}} value={value} mode="fill" onValueChange={change} />
    )
  }
  render(<Harness />)
  return () => current
}

describe("identificadores de fila en las pantallas", () => {
  beforeEach(() => {
    vi.mocked(searchLibraryCatalog).mockReset()
    runtime(true)
  })

  it.each(["form", "document"] as const)("al agregar en %s la fila tiene un id nuevo que no reutiliza el de una borrada", async (screen) => {
    const rows = mount(screen, [])
    await press("Agregar tema")
    const first = rows()[0]!._id
    expect(first).toEqual(expect.any(String))
    await press("Quitar tema 1")
    expect(rows()).toEqual([])
    await press("Agregar tema")
    await press("Agregar tema")
    expect(new Set([first, ...rows().map((row) => row._id)]).size).toBe(3)
  })

  it("limpiar la fila conserva su id y una fila con solo id está en blanco", async () => {
    const rows = mount("form", [{ _id: "r1", resultado: "Algo" }])
    await press("Limpiar tema 1")
    expect(rows()).toEqual([{ _id: "r1", resultado: "" }])
    expect(buttons("Limpiar tema 1")[0]!.disabled).toBe(true)
  })

  it("el id no aparece como columna ni como texto", () => {
    mount("form", [{ _id: "r1", resultado: "Algo" }])
    expect([...document.body.querySelectorAll("th")].map((cell) => cell.textContent)).toEqual(["Resultado", "Acciones"])
    expect(document.body.textContent).not.toContain("r1")
  })

  it("el catálogo aprovecha la fila en blanco con id y agrega filas con id nuevo", () => {
    const book = { title: "Libro" } as unknown as Parameters<typeof addCatalogBook>[2]
    const blank = { temas: [{ _id: "r1", resultado: "A" }, { _id: "r2", resultado: "B" }, { _id: "r3", resultado: "" }] }
    expect(canAddCatalogBook(block(true), blank)).toBe(true)
    const next = addCatalogBook(block(true), blank, book, {})!.temas as Row[]
    expect(next.map((row) => row.resultado)).toEqual(["A", "B", "Libro"])
    expect(next[2]!._id).toEqual(expect.any(String))
    expect(["r1", "r2", "r3"]).not.toContain(next[2]!._id)
  })

  it.each(["form", "document"] as const)("una lista que no es origen sigue sin id en %s", async (screen) => {
    runtime(false)
    const rows = mount(screen, [])
    await press("Agregar tema")
    expect(rows()).toEqual([{ resultado: "" }])
    if (screen === "form") {
      fireEvent.change(document.body.querySelector("input[aria-label='Resultado, tema 1']")!, { target: { value: "x" } })
      await flush()
      await press("Limpiar tema 1")
      expect(rows()).toEqual([{ resultado: "" }])
    }
  })
})
