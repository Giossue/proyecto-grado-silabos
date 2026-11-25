import { act, fireEvent } from "@testing-library/react"
import type { ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { searchLibraryCatalog } from "@/api/libraryCatalog"
import { FieldResponseEditor } from "@/components/domain/syllabus/FieldResponseEditor"
import { setTemplateRuntime } from "@/lib/blocks/runtime"
import type { TemplateDefinitionPayload } from "@silabos/shared/lib/blocks/types"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"
import definition from "@silabos/shared/test/fixtures/template-definition.json"
import { catalogResults } from "@/test/libraryCatalog"
import { flush, renderWithProviders as render } from "@/test/render"

vi.mock("@/api/libraryCatalog", () => ({ searchLibraryCatalog: vi.fn() }))

type Props = Omit<ComponentProps<typeof FieldResponseEditor>, "onValueChange">

const block = (kind: string, value: Record<string, unknown> = {}): DocumentNode => ({ type: "doc", content: [{ type: "documentBlock", attrs: { kind, props: {}, value } }] })
const week = () => ({ contenidos: "", acd_h: "", ape_h: "", aa_h: "", acd: "", ape: "", aa: "", evaluacion: "" })
const units = () => Array.from({ length: 4 }, () => ({ nombre: "", resultado: "", semanas: Array.from({ length: 4 }, week) }))
const cell = (type: "tableHeader" | "tableCell", text = ""): DocumentNode => ({ type, content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }] })
const bibliography: DocumentNode = { type: "doc", content: [{ type: "table", content: [
  { type: "tableRow", content: [cell("tableHeader", "Autor"), cell("tableHeader", "Título")] },
  { type: "tableRow", content: [cell("tableCell"), cell("tableCell")] },
] }] }
const mountWith = (props: Props) => {
  const onValueChange = vi.fn()
  const view = render(<FieldResponseEditor {...props} onValueChange={onValueChange} />)

  return {
    ...view,
    onValueChange,
    emitted: (): DocumentNode => onValueChange.mock.calls.at(-1)![0] as DocumentNode,
    update: (next: Partial<Props>) => view.rerender(<FieldResponseEditor {...props} {...next} onValueChange={onValueChange} />),
  }
}
const mountEditor = (template: DocumentNode, value: DocumentNode | null) => mountWith({ id: "campo", label: "Campo", template, value })
const get = (container: HTMLElement, selector: string): HTMLElement => container.querySelector<HTMLElement>(selector)!
const buttonText = (container: HTMLElement, text: string): HTMLButtonElement => [...container.querySelectorAll("button")].find((button) => button.textContent === text)!

describe("FieldResponseEditor", () => {
  beforeEach(() => setTemplateRuntime(definition as unknown as TemplateDefinitionPayload, { horas_docencia: "64", horas_practicas: "0", horas_autonomas: "0" }))

  it("un campo de texto libre ofrece formato y listas, pero no tablas", async () => {
    const { container } = mountEditor({ type: "doc", content: [{ type: "paragraph" }] }, null)
    await flush()

    await vi.waitFor(() => expect(container.querySelector('[aria-label="Lista con viñetas"]')).not.toBeNull())
    expect(container.querySelector('[aria-label="Insertar tabla"]')).toBeNull()
  })

  it("las unidades van en un acordeón y sus semanas en una tabla del sistema, numeradas en orden", async () => {
    const { container, emitted } = mountEditor(block("unidades"), block("unidades", { units: units() }))

    expect(container.textContent).toContain("Unidad 4")
    expect(container.querySelector('[aria-label="ACD, semana 5"]')).toBeNull()
    fireEvent.click(get(container, '[aria-label="Unidad 2"] button'))
    await flush()
    const second = get(container, '[aria-label="Unidad 2"]')
    expect([...second.querySelectorAll('[data-slot="table-head"]')].map((head) => head.textContent)).toContain("Contenidos temáticos")
    expect(second.querySelector('[aria-label="ACD, semana 5"]')).not.toBeNull()
    expect(get(container, "#campo-0-units-0-semanas-0-acd_h").getAttribute("aria-label")).toBe("ACD, semana 1")
    expect(get(container, "#campo-0-units-0-nombre").tagName).toBe("INPUT")
    expect(get(container, "#campo-0-units-0-resultado").tagName).toBe("TEXTAREA")

    const hours = get(container, "#campo-0-units-0-semanas-0-acd_h") as HTMLInputElement
    hours.value = "2,5"
    hours.setSelectionRange(3, 3)
    const typed = (data: string): boolean => !hours.dispatchEvent(new InputEvent("beforeinput", { data, cancelable: true }))
    expect(typed("a")).toBe(true)
    expect(typed("5")).toBe(false)
    expect(typed(",")).toBe(true)

    fireEvent.change(get(container, "#campo-0-units-0-nombre"), { target: { value: "Fundamentos" } })
    const value = emitted().content![0]!.attrs!.value as { units: Array<{ nombre: string }> }
    expect(value.units[0]!.nombre).toBe("Fundamentos")
  })

  it("el docente agrega unidades hasta las que permite la plantilla", () => {
    const { container, emitted } = mountEditor(block("unidades"), block("unidades", { units: units() }))

    fireEvent.click(buttonText(container, "Agregar unidad"))
    expect((emitted().content![0]!.attrs!.value as { units: unknown[] }).units).toHaveLength(5)
  })

  it("dice qué falta en cada unidad, sin badges ni contadores", () => {
    const filled = units().map((unit, index) => (index === 0 ? { ...unit, nombre: "Matrices", resultado: "Resuelve sistemas" } : index === 3 ? { ...unit, semanas: [] } : unit))
    const { container } = mountEditor(block("unidades"), block("unidades", { units: filled }))

    const items = [...container.querySelectorAll('[aria-label^="Unidad "]')]
    expect(items[0]!.textContent).not.toContain("Falta")
    expect(items[1]!.textContent).toContain("Falta: nombre de la unidad, resultados de aprendizaje")
    expect(items[3]!.textContent).toContain("Falta: nombre de la unidad, resultados de aprendizaje, semanas")
    expect(container.textContent).not.toContain("Pendiente")
    expect(container.querySelector("[data-block-summary]")).toBeNull()
  })

  it("una unidad nueva arranca con las semanas mínimas de la plantilla", () => {
    const limited = structuredClone(definition) as unknown as TemplateDefinitionPayload
    const unitsSchema = limited.blocks.unidades!.value.units as unknown as { minItems: number; items: { properties: { semanas: { minItems: number } } } }
    unitsSchema.items.properties.semanas.minItems = 2
    setTemplateRuntime(limited, { horas_docencia: "64", horas_practicas: "0", horas_autonomas: "0" })
    const { container, emitted } = mountEditor(block("unidades"), block("unidades", { units: units() }))

    fireEvent.click(buttonText(container, "Agregar unidad"))
    expect((emitted().content![0]!.attrs!.value as { units: Array<{ semanas: unknown[] }> }).units[4]!.semanas).toHaveLength(2)
  })

  it("un campo de plantilla antigua que solo tiene bloques también se llena como formulario", () => {
    const { container } = mountWith({ id: "campo", label: "Unidades", template: null, value: block("unidades", { units: units() }) })

    expect(container.querySelector('[role="textbox"]')).toBeNull()
    expect(container.textContent).toContain("Unidad 1")
    expect(container.querySelector("[data-block-summary]")).toBeNull()
  })

  it("los datos de discapacidad aparecen solo si responde Sí y llevan asterisco de obligatorio", () => {
    const { container, update } = mountWith({ id: "campo", label: "Campo", required: true, template: block("identificacion"), value: block("identificacion", { disability: { answer: "no", type: "", description: "" } }) })
    expect(container.textContent).toContain("Estudiantes con discapacidad*")
    expect(container.textContent).not.toContain("Tipo de discapacidad")

    update({ value: block("identificacion", { disability: { answer: "si", type: "", description: "" } }) })
    expect(container.textContent).toContain("Tipo de discapacidad")
  })

  it("una tabla de respuestas se llena dentro de una tabla del sistema con el encabezado de la plantilla", () => {
    const { container, emitted } = mountEditor(bibliography, null)

    expect([...container.querySelectorAll('[data-slot="table-head"]')].map((head) => head.textContent)).toEqual(["Autor", "Título", "Acciones"])
    expect(get(container, "#campo-0-1-0").getAttribute("aria-label")).toBe("Autor, fila 1")
    fireEvent.change(get(container, "#campo-0-1-0"), { target: { value: "García" } })
    expect(emitted().content![0]!.content![1]!.content![0]!.content![0]!.content![0]!.text).toBe("García")

    fireEvent.click(buttonText(container, "Agregar fila"))
    expect(emitted().content![0]!.content).toHaveLength(3)
  })

  it("un encabezado de dos niveles nombra cada columna por su celda más baja", () => {
    const head = (text: string, attrs: Record<string, number> = {}): DocumentNode => ({ ...cell("tableHeader", text), attrs })
    const contribution: DocumentNode = { type: "doc", content: [{ type: "table", content: [
      { type: "tableRow", content: [head("Resultado de la asignatura", { rowspan: 2 }), head("Nivel", { colspan: 2 }), head("Resultado de la carrera", { rowspan: 2 })] },
      { type: "tableRow", content: [head("Alta"), head("Baja")] },
      { type: "tableRow", content: [cell("tableCell"), cell("tableCell"), cell("tableCell"), cell("tableCell")] },
    ] }] }
    const { container } = mountEditor(contribution, null)

    expect(["#campo-0-2-0", "#campo-0-2-1", "#campo-0-2-2", "#campo-0-2-3"].map((id) => get(container, id).getAttribute("aria-label")))
      .toEqual(["Resultado de la asignatura, fila 1", "Alta, fila 1", "Baja, fila 1", "Resultado de la carrera, fila 1"])
  })

  describe("bibliografía con el catálogo de la biblioteca", () => {
    const empty = { autor: "", titulo: "", anio: "", ciudad: "", editorial: "", isbn: "", codigo: "" }
    const found = { id: "10525", title: "Proyectos de inversión", author: "Sapag Chain, Nassir", year: "2011", place: "Santiago de Chile", publisher: "Pearson Educación", isbn: "9789563431063", call_number: "658.404 S2411p", format: "Libro físico", kind: "Libro" }
    const mountBibliography = (disabled = false) => mountWith({ id: "campo", label: "Campo", template: block("bibliografia"), value: block("bibliografia", { libros: [empty] }), disabled })
    const buttonWith = (text: string): HTMLButtonElement | undefined => [...document.body.querySelectorAll("button")].find((item) => item.textContent?.trim() === text)

    it("ofrece «Buscar en la biblioteca» y llena la fila con el libro elegido", async () => {
      vi.mocked(searchLibraryCatalog).mockResolvedValue(catalogResults([found]))
      const { emitted } = mountBibliography()
      await flush()

      fireEvent.click(buttonWith("Buscar en la biblioteca")!)
      await flush()
      fireEvent.change(document.body.querySelector<HTMLInputElement>('[aria-label="Texto a buscar"]')!, { target: { value: "Sapag" } })
      await flush()
      fireEvent.submit(document.body.querySelector('[role="dialog"] form')!)
      await flush()
      fireEvent.click(buttonWith("Agregar")!)
      await flush()

      const attrs = emitted().content![0]!.attrs as unknown as { value: { libros: Array<Record<string, string>> } }
      expect(attrs.value.libros).toEqual([{ autor: "Sapag Chain, Nassir", titulo: "Proyectos de inversión", anio: "2011", ciudad: "Santiago de Chile", editorial: "Pearson Educación", isbn: "9789563431063", codigo: "Libro físico" }])
    })

    it("«Limpiar» vacía la fila sin quitarla, y con una sola fila el botón de borrar no se puede usar", async () => {
      const filled = { autor: "Sapag Chain, Nassir", titulo: "Proyectos de inversión", anio: "2011", ciudad: "Santiago de Chile", editorial: "Pearson Educación", isbn: "9789563431063", codigo: "658.404 S2411p" }
      const { emitted } = mountWith({ id: "campo", label: "Campo", template: block("bibliografia"), value: block("bibliografia", { libros: [filled] }) })
      await flush()

      expect(document.body.querySelector<HTMLButtonElement>('[aria-label="Quitar libro 1"]')!.disabled).toBe(true)
      fireEvent.click(document.body.querySelector<HTMLButtonElement>('[aria-label="Limpiar libro 1"]')!)
      await flush()

      const attrs = emitted().content![0]!.attrs as unknown as { value: { libros: Array<Record<string, string>> } }
      expect(attrs.value.libros).toEqual([{ autor: "", titulo: "", anio: "", ciudad: "", editorial: "", isbn: "", codigo: "" }])
    })

    it("los tooltips de «Limpiar» y «Quitar» dicen solo «libro», sin número de fila", async () => {
      mountBibliography()
      await flush()
      for (const [label, text] of [["Limpiar libro 1", "Limpiar libro"], ["Quitar libro 1", "Quitar libro"]] as const) {
        const trigger = document.body.querySelector(`[aria-label="${label}"]`)!.parentElement!
        fireEvent.pointerMove(trigger, { pointerType: "mouse" })
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50))
        })
        await flush()
        const tips = Array.from(document.body.querySelectorAll('[role="tooltip"]')).map((tip) => tip.textContent)
        expect(tips).toContain(text)
        fireEvent.pointerLeave(trigger, { pointerType: "mouse" })
      }
    })

    it("«Limpiar» no se puede usar en una fila vacía", async () => {
      mountBibliography()
      await flush()
      expect(document.body.querySelector<HTMLButtonElement>('[aria-label="Limpiar libro 1"]')!.disabled).toBe(true)
    })

    it("con el sílabo bloqueado no se puede buscar", async () => {
      mountBibliography(true)
      await flush()

      expect(buttonWith("Buscar en la biblioteca")!.disabled).toBe(true)
    })
  })
})
