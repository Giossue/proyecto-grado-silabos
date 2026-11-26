import { fireEvent, render } from "@testing-library/react"
import type { ComponentProps } from "react"
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
const spaceButtons = (container: HTMLElement): HTMLButtonElement[] => [...container.querySelectorAll<HTMLButtonElement>('button[aria-label="Espacio para el docente"]')]
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

describe("El coordinador escribe un campo Carrera y deja espacios para el docente", () => {
  it("en un espacio escribe texto que le llega fijo al docente", () => {
    const { container, last } = mountSetup(template())
    expect(container.textContent).toContain("Estrategias de la asignatura")
    fireEvent.change(container.querySelectorAll("textarea")[0]!, { target: { value: "Clases activas" } })
    expect(last().content![1]).toEqual({ type: "paragraph", content: [{ type: "text", text: "Clases activas" }] })
    expect(last().content![0]).toEqual(template().content![0])
  })

  it("una celda queda como espacio al elegir el tipo, se ve como en el cuadro de texto y se ajusta con el mismo botón", async () => {
    const { container, last, update } = mountSetup(template())
    expect(spaceButtons(container)).toHaveLength(3)
    await openSpace(container, 1)
    expect(kinds().map((button) => button.textContent?.trim())).toEqual(["Texto libre", "Elegir una", "Elegir varias"])
    expect(checkedKinds()).toEqual([])
    expect(insertButton()).toBeNull()
    expect(document.querySelector("[data-response-more]")).toBeNull()
    expect(document.body.textContent).not.toContain("solo responde")

    await pick("Elegir una")
    const cell = (): DocumentNode => last().content![2]!.content![1]!.content![0]!
    expect(cell().content![0]!.content).toEqual([{ type: "response", attrs: { kind: "una", options: [], value: null } }])
    update({ value: last() })
    await flush()
    // The popover stays open: the options are written there, as in the text box.
    expect(kinds()).toHaveLength(3)
    await option(1, "Taller")
    expect(cell().content![0]!.content).toEqual([{ type: "response", attrs: { kind: "una", options: [{ const: "o1", title: "Taller" }], value: null } }])
    update({ value: last() })
    await flush()

    const space = container.querySelector("[data-career-space]")!
    expect([...space.querySelectorAll(".document-response__option")].map((item) => [item.textContent, item.getAttribute("data-mark")])).toEqual([["Taller", "radio"]])
    expect(spaceButtons(container)).toHaveLength(3)
    expect(container.textContent).not.toContain("Espacio para el docente:")
    expect(container.querySelector('input[aria-label="Opción 1"]')).toBeNull()
    expect(container.querySelector('button[aria-label^="Quitar el espacio"]')).toBeNull()

    await pick("Elegir una")
    expect(last()).toEqual(template())
  })

  it("al abrir el botón de una celda con espacio muestra su tipo y sus opciones", async () => {
    const stored = template()
    stored.content![2]!.content![1]!.content![0] = cellOf("tableCell", [{ type: "response", attrs: { kind: "varias", options: [{ const: "o1", title: "Foro" }], value: [] } }])
    const { container } = mountSetup(template(), stored)
    expect(container.querySelector("[data-career-space] .document-response__option")!.getAttribute("data-mark")).toBe("checkbox")
    await openSpace(container, 1)

    expect(checkedKinds()).toEqual(["Elegir varias"])
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Opción 1"]')!.value).toBe("Foro")
  })

  it("en una fila agregada también se puede poner y quitar un espacio", async () => {
    const stored = template()
    stored.content![2]!.content!.push(structuredClone(stored.content![2]!.content![1]!))
    const { container, last, update } = mountSetup(template(), stored)
    expect(spaceButtons(container)).toHaveLength(5)
    await openSpace(container, 3)
    await pick("Texto libre")
    const added = (): DocumentNode => last().content![2]!.content![2]!.content![0]!
    expect(added().content![0]!.content).toEqual([{ type: "response", attrs: { kind: "texto", options: [], value: "" } }])

    update({ value: last() })
    await flush()
    await openSpace(container, 3)
    await pick("Texto libre")
    expect(added()).toEqual(cellOf("tableCell"))
  })

  it("deja un espacio de texto libre en un párrafo al elegirlo", async () => {
    const { container, last } = mountSetup(template())
    await openSpace(container, 0)
    await pick("Texto libre")
    expect(last().content![1]!.content).toEqual([{ type: "response", attrs: { kind: "texto", options: [], value: "" } }])
  })

  it("en el editor de texto el espacio se coloca al elegir el tipo y cambia en tiempo real, sin duplicarse", async () => {
    const { container, last } = mountSetup({ type: "doc", content: [{ type: "paragraph" }] })
    await flush()
    await vi.waitFor(() => expect(container.querySelector('[aria-label="Negrita"]')).not.toBeNull())
    fireEvent.click(container.querySelector('[role="toolbar"] button[aria-label="Espacio para el docente"]')!)
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

  it("una respuesta que fijó Administración conserva su tipo y solo recibe las opciones que faltan", () => {
    const { container, last } = mountSetup(template([{ type: "response", attrs: { kind: "una", options: [], value: null } }]))
    expect(container.textContent).toContain("Elegir una (lo definió Administración)")
    fireEvent.change(container.querySelector('input[aria-label="Opción 1"]')!, { target: { value: "Presencial" } })
    expect(last().content![1]!.content![0]!.attrs).toEqual({ kind: "una", options: [{ const: "o1", title: "Presencial" }], value: null })
  })

  it("bloqueado no deja escribir ni poner espacios", () => {
    const { container } = mountSetup(template(), null, true)
    expect(spaceButtons(container).every((button) => button.disabled)).toBe(true)
    expect([...container.querySelectorAll("textarea")].every((area) => area.disabled)).toBe(true)
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
    const tool = (): HTMLButtonElement => view.container.querySelector<HTMLButtonElement>('[role="toolbar"] button[aria-label="Espacio para el docente"]')!
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

describe("El coordinador ajusta las opciones de una respuesta de la plantilla en su materia", () => {
  const base = [{ const: "o1", title: "Aula" }, { const: "o2", title: "Laboratorio" }]
  const placed = (options = base, value: unknown = null, extra: Record<string, unknown> = {}): DocumentNode => ({ type: "response", attrs: { kind: "una", options, value, ...extra } as never })
  const openOptions = async (container: HTMLElement): Promise<void> => {
    fireEvent.click(container.querySelector('button[aria-label="Opciones de la respuesta"]')!)
    await flush()
  }

  it("la marca «De la plantilla» y el cuadro solo deja cambiar las opciones, no el tipo, y no trae «Más opciones»", async () => {
    const { container, last } = mountSetup(template([placed(base, null, { display: "desplegable" })]))
    expect(container.querySelector("[data-template-response]")!.textContent).toBe("De la plantilla")
    await openOptions(container)
    expect(kinds().every((button) => button.disabled || button.getAttribute("data-disabled") !== null)).toBe(true)
    expect(document.querySelector("[data-response-fixed]")?.textContent).toContain("Administración")
    expect(document.querySelector("[data-response-more]")).toBeNull()
    expect(document.body.textContent).not.toContain("Más opciones")
    expect(document.body.textContent).not.toContain("Estas opciones las fija Administración")
    expect(document.querySelector("[data-response-reset]")).toBeNull()
    expect(insertButton()).toBeNull()
    await option(2, "Taller")
    expect(last().content![1]!.content![0]!.attrs).toEqual({ kind: "una", options: [{ const: "o1", title: "Aula" }, { const: "o2", title: "Taller" }], value: null, display: "desplegable" })
  })

  it("muestra las opciones propias de la materia y las restablece a las de la plantilla, soltando lo elegido que ya no existe", async () => {
    const own = [{ const: "o1", title: "Aula" }, { const: "o3", title: "Campo" }]
    const { container, last } = mountSetup(template([placed()]), template([placed(own, "o3", { customOptions: true })]))
    expect(container.textContent).toContain("Opciones propias")
    await openOptions(container)
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Opción 2"]')!.value).toBe("Campo")
    fireEvent.click(document.querySelector<HTMLButtonElement>("[data-response-reset]")!)
    await flush()
    expect(last().content![1]!.content![0]!.attrs).toEqual({ kind: "una", options: base, value: null })
  })

  it("cambiar las opciones se aplica al escribir y conserva lo elegido aunque la opción quede un momento vacía", async () => {
    const { container, last, update } = mountSetup(template([placed()]), template([placed(base, "o2")]))
    await openOptions(container)
    await option(2, "")
    expect(last().content![1]!.content![0]!.attrs).toEqual({ kind: "una", options: [base[0]], value: null })
    update({ value: last() })
    await flush()
    await option(2, "Taller")
    expect(last().content![1]!.content![0]!.attrs).toEqual({ kind: "una", options: [{ const: "o1", title: "Aula" }, { const: "o2", title: "Taller" }], value: "o2" })
  })

  it("sin ninguna opción no aplica el cambio y lo dice", async () => {
    const { container, last } = mountSetup(template([placed()]))
    await openOptions(container)
    await option(1, "")
    await option(2, "")
    expect(last().content![1]!.content![0]!.attrs).toEqual({ kind: "una", options: [base[1]], value: null })
    expect(document.body.textContent).toContain("Escriba al menos una opción")
  })
})
