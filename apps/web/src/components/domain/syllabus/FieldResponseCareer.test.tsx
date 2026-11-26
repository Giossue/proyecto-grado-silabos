import { fireEvent, render } from "@testing-library/react"
import type { ComponentProps } from "react"
import { CellSelection } from "@tiptap/pm/tables"
import { describe, expect, it, vi } from "vitest"
import { FieldResponseEditor } from "@/components/domain/syllabus/FieldResponseEditor"
import { setTemplateRuntime } from "@/lib/blocks/runtime"
import { nodesOfType, type DocumentNode } from "@silabos/shared/lib/templateDocument"
import type { TemplateDefinitionPayload } from "@silabos/shared/lib/blocks/types"
import definition from "@silabos/shared/test/fixtures/template-definition.json"
import { flush } from "@/test/render"

type Props = Omit<ComponentProps<typeof FieldResponseEditor>, "onValueChange">

const cellOf = (type: "tableCell" | "tableHeader", content: DocumentNode[] = []): DocumentNode => ({ type, attrs: { colspan: 1, rowspan: 1 }, content: [{ type: "paragraph", content }] })
const template = (slot: DocumentNode[] = []): DocumentNode => ({ type: "doc", content: [
  { type: "paragraph", content: [{ type: "text", text: "Estrategias de la asignatura" }] },
  { type: "paragraph", content: slot },
  { type: "table", content: [
    { type: "tableRow", content: [cellOf("tableHeader", [{ type: "text", text: "Técnica" }]), cellOf("tableHeader", [{ type: "text", text: "Horas" }])] },
    { type: "tableRow", content: [cellOf("tableCell"), cellOf("tableCell")] },
  ] },
] })
const mountWith = (props: Props) => {
  setTemplateRuntime(definition as unknown as TemplateDefinitionPayload, {})
  const onValueChange = vi.fn()
  const view = render(<FieldResponseEditor {...props} onValueChange={onValueChange} />)

  return {
    ...view,
    last: (): DocumentNode => onValueChange.mock.calls.at(-1)![0] as DocumentNode,
    update: (next: Partial<Props>) => view.rerender(<FieldResponseEditor {...props} {...next} onValueChange={onValueChange} />),
  }
}
const mountSetup = (source: DocumentNode, value: DocumentNode | null = null, disabled = false) => mountWith({ id: "campo", label: "Métodos", template: source, value, career: true, disabled })
const kinds = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
const spaceButtons = (container: HTMLElement): HTMLButtonElement[] => [...container.querySelectorAll<HTMLButtonElement>('button[aria-label="Configurar campo"]')]
const openSpace = async (container: HTMLElement, index: number): Promise<void> => {
  fireEvent.click(spaceButtons(container)[index]!)
  await flush()
}
const pick = async (kind: string): Promise<void> => {
  fireEvent.click(kinds().find((button) => button.textContent?.trim() === kind)!)
  await flush()
}
const checkedKinds = (): string[] => kinds().filter((button) => button.getAttribute("aria-checked") === "true").map((button) => button.textContent!.trim())
const insertButton = (): Element | null => document.querySelector("[data-response-insert]")
const responsesOf = (document_: DocumentNode): unknown[] => nodesOfType(document_, "response").map((node) => JSON.parse(JSON.stringify(node.attrs)))
const option = async (index: number, value: string): Promise<void> => {
  fireEvent.change(document.querySelector<HTMLInputElement>(`input[aria-label="Opción ${index}"]`)!, { target: { value } })
  await flush()
}

describe("El coordinador edita en un solo editor todo el campo Editable", () => {
  const editorReady = async (container: HTMLElement): Promise<void> => {
    await flush()
    await vi.waitFor(() => expect(container.querySelector('[aria-label="Negrita"]')).not.toBeNull())
  }
  const content = (container: HTMLElement): Element => container.querySelector(".free-text-editor__content")!

  it("el texto de la plantilla, la tabla y los espacios salen dentro del mismo editor, sin texto fijo aparte ni cuadros", async () => {
    const { container } = mountSetup(template([{ type: "response", attrs: { kind: "una", options: [{ const: "o1", title: "Aula" }], value: null } }]))
    await editorReady(container)

    expect(container.querySelectorAll(".free-text-editor")).toHaveLength(1)
    expect(content(container).textContent).toContain("Estrategias de la asignatura")
    expect(content(container).textContent).toContain("Técnica")
    expect(content(container).querySelector(".document-response")).not.toBeNull()
    expect(content(container).getAttribute("contenteditable")).toBe("true")
    expect(container.querySelector("textarea")).toBeNull()
    expect(container.querySelector("[data-template-response]")).toBeNull()
  })

  it("abre lo que la materia ya guardó, no lo que trae la plantilla", async () => {
    const stored: DocumentNode = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Estrategias propias de la carrera" }] }] }
    const { container } = mountSetup(template(), stored)
    await editorReady(container)

    expect(content(container).textContent).toContain("Estrategias propias de la carrera")
    expect(content(container).textContent).not.toContain("Estrategias de la asignatura")
  })

  it("al poner un espacio entrega el documento entero, con el texto de la plantilla", async () => {
    const { container, last } = mountSetup(template())
    await editorReady(container)
    fireEvent.click(container.querySelector('[role="toolbar"] button[aria-label="Configurar campo"]')!)
    await flush()
    await pick("Elegir una")

    expect(nodesOfType(last(), "text").map((node) => node.text)).toContain("Estrategias de la asignatura")
    expect(nodesOfType(last(), "table")).toHaveLength(1)
    expect(responsesOf(last())).toEqual([{ kind: "una", options: [], value: null }])
  })

  it("en el editor de texto el espacio se coloca al elegir el tipo y cambia en tiempo real, sin duplicarse", async () => {
    const { container, last } = mountSetup({ type: "doc", content: [{ type: "paragraph" }] })
    await flush()
    await vi.waitFor(() => expect(container.querySelector('[aria-label="Negrita"]')).not.toBeNull())
    fireEvent.click(container.querySelector('[role="toolbar"] button[aria-label="Configurar campo"]')!)
    await flush()
    expect(checkedKinds()).toEqual([])
    expect(document.body.textContent).not.toContain("solo responde")

    await pick("Elegir una")
    expect(responsesOf(last())).toEqual([{ kind: "una", options: [], value: null }])
    await option(1, "Taller")
    expect(responsesOf(last())).toEqual([{ kind: "una", options: [{ const: "o1", title: "Taller" }], value: null }])
    await pick("Elegir varias")
    expect(responsesOf(last())).toEqual([{ kind: "varias", options: [{ const: "o1", title: "Taller" }], value: [] }])
    expect(insertButton()).toBeNull()
    await pick("Texto libre")
    expect(responsesOf(last())).toEqual([{ kind: "texto", options: [], value: "" }])
    expect(kinds()).toHaveLength(0)
  })

  it("bloqueado no deja escribir ni poner espacios", async () => {
    const { container } = mountSetup(template(), null, true)
    await editorReady(container)
    expect(content(container).getAttribute("contenteditable")).toBe("false")
    expect(container.querySelector<HTMLButtonElement>('[role="toolbar"] button[aria-label="Configurar campo"]')!.disabled).toBe(true)
  })
})

describe("En el proyecto de carrera las tablas de la plantilla quedan protegidas", () => {
  type Editor = import("@tiptap/core").Editor
  const mountTable = async () => {
    const view = mountSetup(template())
    await flush()
    await vi.waitFor(() => expect(view.container.querySelector('[aria-label="Negrita"]')).not.toBeNull())
    const editor = (view.container.querySelector(".free-text-editor__content") as unknown as { editor: Editor }).editor
    const position = (type: string): number => {
      let found = -1
      editor.state.doc.descendants((node, at) => {
        if (found < 0 && node.type.name === type) found = at
      })
      return found
    }
    const inCell = (): number => position("tableCell") + 2
    return { ...view, editor, position, inCell }
  }
  const tablesIn = (document_: DocumentNode): DocumentNode[] => nodesOfType(document_, "table")

  it("no deja quitar la tabla y el documento queda igual", async () => {
    const { editor, position } = await mountTable()
    const before = JSON.stringify(editor.getJSON())
    const at = position("table")
    editor.view.dispatch(editor.state.tr.delete(at, at + editor.state.doc.nodeAt(at)!.nodeSize))
    await flush()

    expect(JSON.stringify(editor.getJSON())).toBe(before)
  })

  it("no deja agregar ni quitar filas o columnas, ni combinar celdas", async () => {
    const { editor, inCell } = await mountTable()
    const before = JSON.stringify(editor.getJSON())
    for (const change of ["addRowAfter", "deleteRow", "addColumnAfter", "deleteColumn"] as const) {
      editor.chain().setTextSelection(inCell())[change]().run()
      await flush()
      expect(JSON.stringify(editor.getJSON())).toBe(before)
    }
    expect(tablesIn(editor.getJSON() as DocumentNode)[0]!.content).toHaveLength(2)

    const cells: number[] = []
    editor.state.doc.descendants((node, at) => {
      if (node.type.name === "tableCell") cells.push(at)
    })
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cells[0]!, cells[1]!)))
    editor.commands.mergeCells()
    await flush()
    expect(JSON.stringify(editor.getJSON())).toBe(before)
  })

  it("deja escribir dentro de una celda", async () => {
    const { editor, inCell, last } = await mountTable()
    editor.chain().setTextSelection(inCell()).insertContent("Taller grupal").run()
    await flush()

    expect(nodesOfType(tablesIn(last())[0]!, "text").map((node) => node.text)).toContain("Taller grupal")
  })

  it("no muestra las herramientas que cambian la forma de la tabla", async () => {
    const { container, editor, inCell } = await mountTable()
    editor.chain().focus().setTextSelection(inCell()).run()
    await flush()
    const labels = [...container.querySelectorAll('[role="toolbar"] button')].map((button) => button.getAttribute("aria-label") ?? button.textContent?.trim())

    for (const tool of ["Insertar tabla", "+ Fila", "− Fila", "+ Columna", "− Columna", "Combinar", "Separar", "Quitar tabla"]) expect(labels).not.toContain(tool)
    expect(container.textContent).not.toContain("Agregar fila")
  })
})

describe("El campo completo del coordinador admite un solo tipo de respuesta", () => {
  const blank: DocumentNode = { type: "doc", content: [{ type: "paragraph" }] }
  const written = (text: string): DocumentNode => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })
  const textsOf = (document_: DocumentNode): string[] => nodesOfType(document_, "text").map((node) => node.text!)
  const mountField = async (value: DocumentNode | null = null) => {
    const view = mountSetup(blank, value)
    await flush()
    await vi.waitFor(() => expect(view.container.querySelector('[aria-label="Negrita"]')).not.toBeNull())
    const tool = (): HTMLButtonElement => view.container.querySelector<HTMLButtonElement>('[role="toolbar"] button[aria-label="Configurar campo"]')!
    const toggleTool = async (): Promise<void> => {
      fireEvent.click(tool())
      await flush()
    }
    const canWrite = (): boolean => view.container.querySelector(".free-text-editor__content")!.getAttribute("contenteditable") === "true"
    const bold = (): HTMLButtonElement => view.container.querySelector<HTMLButtonElement>('[aria-label="Negrita"]')!

    return { ...view, tool, toggleTool, canWrite, bold }
  }

  it("«Elegir una» conserva el texto escrito, y al reabrir cambia la misma variable en vez de agregar otra", async () => {
    const field = await mountField(written("Las clases serán en "))
    await field.toggleTool()
    await pick("Elegir una")
    await option(1, "Aula")
    expect(textsOf(field.last())).toEqual(["Las clases serán en "])
    expect(responsesOf(field.last())).toEqual([{ kind: "una", options: [{ const: "o1", title: "Aula" }], value: null }])
    expect(field.canWrite()).toBe(true)

    await field.toggleTool()
    await field.toggleTool()
    expect(checkedKinds()).toEqual(["Elegir una"])
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Opción 1"]')!.value).toBe("Aula")
    await pick("Elegir varias")
    expect(responsesOf(field.last())).toEqual([{ kind: "varias", options: [{ const: "o1", title: "Aula" }], value: [] }])
  })

  it("las opciones de la variable se ven como casillas: círculos si se elige una y cuadros si se eligen varias", async () => {
    const field = await mountField()
    const marks = (): Array<[string, string | null]> =>
      [...field.container.querySelectorAll(".free-text-editor__content .document-response__option")].map((item) => [item.textContent!, item.getAttribute("data-mark")])
    const variable = (): string => field.container.querySelector(".free-text-editor__content .document-response")!.textContent!
    await field.toggleTool()
    await pick("Elegir una")
    expect(variable()).toBe("Elegir una: sin opciones")

    await option(1, "Aula")
    fireEvent.click(document.querySelector<HTMLButtonElement>("[data-response-add-option]")!)
    await flush()
    await option(2, "Campo")
    expect(marks()).toEqual([["Aula", "radio"], ["Campo", "radio"]])
    expect(variable()).toBe("AulaCampo")
    expect(field.container.querySelector(".free-text-editor__content .document-response")!.getAttribute("aria-label")).toBe("Elegir una")
    expect(field.container.querySelector(".free-text-editor__content input")).toBeNull()

    await pick("Elegir varias")
    expect(marks()).toEqual([["Aula", "checkbox"], ["Campo", "checkbox"]])
    expect(responsesOf(field.last())).toEqual([{ kind: "varias", options: [{ const: "o1", title: "Aula" }, { const: "o2", title: "Campo" }], value: [] }])
    await pick("Texto libre")
    expect(variable()).toBe("Texto libre")
    expect(marks()).toEqual([])
  })

  it("volver a pulsar el tipo marcado lo quita y deja el texto", async () => {
    const field = await mountField(written("Apuntes "))
    await field.toggleTool()
    await pick("Elegir una")
    await pick("Elegir una")

    expect(checkedKinds()).toEqual([])
    expect(responsesOf(field.last())).toEqual([])
    expect(textsOf(field.last())).toEqual(["Apuntes "])
    expect(document.querySelector('input[aria-label="Opción 1"]')).toBeNull()
  })

  it("«Texto libre» borra lo escrito y cierra el campo al coordinador hasta que lo desmarque", async () => {
    const field = await mountField(written("Apuntes del coordinador"))
    await field.toggleTool()
    await pick("Texto libre")

    expect(textsOf(field.last())).toEqual([])
    expect(responsesOf(field.last())).toEqual([{ kind: "texto", options: [], value: "" }])
    expect(field.canWrite()).toBe(false)
    expect(field.bold().disabled).toBe(true)
    expect(field.tool().disabled).toBe(false)

    await field.toggleTool()
    expect(checkedKinds()).toEqual(["Texto libre"])
    await pick("Texto libre")
    expect(responsesOf(field.last())).toEqual([])
    expect(field.canWrite()).toBe(true)
    expect(field.bold().disabled).toBe(false)
  })

  it("un campo guardado con «Texto libre» se abre cerrado para el coordinador", async () => {
    const field = await mountField({ type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "response", attrs: { kind: "texto", options: [], value: "" } }] }] })

    await vi.waitFor(() => expect(field.canWrite()).toBe(false))
    expect(field.tool().disabled).toBe(false)
    expect(() => field.last()).toThrow()
  })
})

describe("El docente llena solo los espacios de un campo Carrera", () => {
  it("lo que respondió el coordinador sale fijo y el texto libre se escribe en un cuadro", () => {
    const source: DocumentNode = { type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "Modalidad: " }, { type: "response", attrs: { kind: "una", options: [{ const: "o1", title: "Presencial" }], value: "o1" } }] },
      { type: "paragraph", content: [{ type: "response", attrs: { kind: "texto", options: [], value: "" } }] },
    ] }
    const { container, last } = mountWith({ id: "campo", label: "Métodos", template: source, value: source })
    expect(container.textContent).toContain("Presencial")
    expect(container.querySelector('button[aria-label="Elegir en Métodos"]')).toBeNull()
    fireEvent.change(container.querySelector('textarea[aria-label="Métodos"]')!, { target: { value: "Lecturas" } })
    expect(last().content![1]!.content![0]!.attrs).toEqual({ kind: "texto", options: [], value: "Lecturas" })
  })
})
