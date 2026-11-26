import { fireEvent, render } from "@testing-library/react"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"
import { FieldResponseEditor } from "@/components/domain/syllabus/FieldResponseEditor"
import { setTemplateRuntime } from "@/lib/blocks/runtime"
import type { TemplateDefinitionPayload } from "@silabos/shared/lib/blocks/types"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"
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
const insert = async (): Promise<void> => {
  fireEvent.click(document.querySelector<HTMLButtonElement>("[data-response-insert]")!)
  await flush()
}
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

  it("con el botón de la cinta convierte una celda en un espacio de elegir con sus opciones y lo puede quitar", async () => {
    const { container, last, update } = mountSetup(template())
    expect(spaceButtons(container)).toHaveLength(3)
    await openSpace(container, 1)
    expect(kinds().map((button) => button.textContent?.trim())).toEqual(["Texto libre", "Elegir una", "Elegir varias"])
    await pick("Elegir una")
    expect(document.querySelector<HTMLButtonElement>("[data-response-insert]")!.disabled).toBe(true)
    await option(1, "Taller")
    await insert()
    const cell = last().content![2]!.content![1]!.content![0]!
    expect(cell.content![0]!.content).toEqual([{ type: "response", attrs: { kind: "una", options: [{ const: "o1", title: "Taller" }], value: null } }])

    update({ value: last() })
    await flush()
    expect(container.textContent).toContain("Espacio para el docente: Elegir una")
    fireEvent.click(container.querySelector('button[aria-label="Quitar el espacio de Técnica, fila 1"]')!)
    expect(last()).toEqual(template())
  })

  it("deja un espacio de texto libre en un párrafo", async () => {
    const { container, last } = mountSetup(template())
    await openSpace(container, 0)
    await pick("Texto libre")
    await insert()
    expect(last().content![1]!.content).toEqual([{ type: "response", attrs: { kind: "texto", options: [], value: "" } }])
  })

  it("un campo vacío completo se escribe con el editor de texto y su cinta trae el botón de espacios", async () => {
    const { container } = mountSetup({ type: "doc", content: [{ type: "paragraph" }] })
    await flush()
    await vi.waitFor(() => expect(container.querySelector('[aria-label="Negrita"]')).not.toBeNull())
    expect(container.querySelector('[role="toolbar"] button[aria-label="Espacio para el docente"]')).not.toBeNull()
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

  it("la marca «De la plantilla» y el cuadro solo deja cambiar las opciones, no el tipo ni Más opciones", async () => {
    const { container, last } = mountSetup(template([placed(base, null, { display: "desplegable" })]))
    expect(container.querySelector("[data-template-response]")!.textContent).toBe("De la plantilla")
    await openOptions(container)
    expect(kinds().every((button) => button.disabled || button.getAttribute("data-disabled") !== null)).toBe(true)
    expect(document.querySelector("[data-response-fixed]")?.textContent).toContain("Administración")
    fireEvent.click(document.querySelector<HTMLButtonElement>("[data-response-more]")!)
    await flush()
    expect(document.querySelector<HTMLButtonElement>("[data-response-required]")!.disabled).toBe(true)
    expect(document.querySelector<HTMLInputElement>("[data-response-help]")!.disabled).toBe(true)
    expect(document.querySelector("[data-response-locked]")?.textContent).toContain("Administración")
    expect(document.querySelector("[data-response-reset]")).toBeNull()
    await option(2, "Taller")
    await insert()
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

  it("cambiar las opciones conserva lo elegido si la opción sigue", async () => {
    const { container, last } = mountSetup(template([placed()]), template([placed(base, "o1")]))
    await openOptions(container)
    await option(2, "Taller")
    await insert()
    expect(last().content![1]!.content![0]!.attrs).toEqual({ kind: "una", options: [{ const: "o1", title: "Aula" }, { const: "o2", title: "Taller" }], value: "o1" })
  })
})
