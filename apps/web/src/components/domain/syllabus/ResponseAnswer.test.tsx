import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { FieldResponseEditor } from "@/components/domain/syllabus/FieldResponseEditor"
import { ResponseAnswer } from "@/components/domain/syllabus/ResponseAnswer"
import { setTemplateRuntime } from "@/lib/blocks/runtime"
import type { TemplateDefinitionPayload } from "@silabos/shared/lib/blocks/types"
import { responseEmpty } from "@/lib/fieldResponses"
import type { ResponseAttrs } from "@silabos/shared/lib/responseKinds"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"
import definition from "@silabos/shared/test/fixtures/template-definition.json"
import { flush } from "@/test/render"

const options = [{ const: "o1", title: "Clase magistral" }, { const: "o2", title: "Taller" }, { const: "o3", title: "Seminario" }]
const answer = (attrs: ResponseAttrs, disabled = false) => {
  const onValueChange = vi.fn()
  const view = render(<ResponseAnswer attrs={attrs} label="Técnica" disabled={disabled} onValueChange={onValueChange} />)
  const rerender = (next: ResponseAttrs) => view.rerender(<ResponseAnswer attrs={next} label="Técnica" disabled={disabled} onValueChange={onValueChange} />)

  return { ...view, onValueChange, rerender, last: (): unknown => onValueChange.mock.calls.at(-1)![0] }
}
const response = (kind: string, value: unknown, list = options): DocumentNode => ({ type: "response", attrs: { kind, options: kind === "texto" ? [] : list, value: value as never } })
const cellOf = (type: "tableCell" | "tableHeader", content: DocumentNode[]): DocumentNode => ({ type, attrs: { colspan: 1, rowspan: 1 }, content: [{ type: "paragraph", content }] })
const template: DocumentNode = { type: "doc", content: [
  { type: "paragraph", content: [{ type: "text", text: "Horas de tutoría: " }, response("texto", "")] },
  { type: "table", content: [
    { type: "tableRow", content: [cellOf("tableHeader", [{ type: "text", text: "Técnica" }]), cellOf("tableHeader", [{ type: "text", text: "Detalle" }])] },
    { type: "tableRow", content: [cellOf("tableCell", [response("una", null)]), cellOf("tableCell", [])] },
  ] },
] }
const chooseOption = async (index: number): Promise<void> => {
  fireEvent.click(document.querySelectorAll<HTMLElement>('[role="option"]')[index]!)
  await flush()
}
const button = (container: HTMLElement, label: string): HTMLButtonElement => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!

const scrollIntoView = Element.prototype.scrollIntoView
beforeAll(() => { Element.prototype.scrollIntoView = vi.fn() })
afterAll(() => { Element.prototype.scrollIntoView = scrollIntoView })

describe("Responder un tipo de respuesta", () => {
  it("un texto libre se escribe en un cuadro, con saltos de línea", () => {
    const { container, last } = answer({ kind: "texto", options: [], value: "" })
    expect(container.querySelector("input")).toBeNull()
    fireEvent.change(container.querySelector('textarea[aria-label="Técnica"]')!, { target: { value: "Primera línea\nSegunda línea" } })
    expect(last()).toBe("Primera línea\nSegunda línea")
  })

  it("elegir una marca una sola opción, queda fija y solo se quita", async () => {
    const { container, last } = answer({ kind: "una", options, value: "o1" })
    expect(container.querySelector("input")).toBeNull()
    expect(container.querySelector("textarea")).toBeNull()
    expect(container.querySelector("[data-response-chosen]")!.textContent).toContain("Clase magistral")

    fireEvent.click(button(container, "Elegir en Técnica"))
    await flush()
    expect(document.querySelector('[role="dialog"] input, [role="dialog"] textarea')).toBeNull()
    expect([...document.querySelectorAll('[role="option"]')].map((item) => item.textContent?.trim())).toEqual(["Clase magistral", "Taller", "Seminario"])
    await chooseOption(2)
    expect(last()).toBe("o3")

    fireEvent.click(button(container, "Quitar «Clase magistral»"))
    expect(last()).toBeNull()
  })

  it("elegir varias marca una o más opciones y cada una se quita por separado", async () => {
    const { container, last, rerender } = answer({ kind: "varias", options, value: ["o2"] })
    fireEvent.click(button(container, "Elegir en Técnica"))
    await flush()
    await chooseOption(0)
    expect(last()).toEqual(["o2", "o1"])
    rerender({ kind: "varias", options, value: ["o2", "o1"] })
    expect([...container.querySelectorAll("[data-response-chosen]")].map((chip) => chip.textContent)).toEqual(["Taller", "Clase magistral"])
    fireEvent.click(button(container, "Quitar «Taller»"))
    expect(last()).toEqual(["o1"])
  })

  it("sin opciones escritas pide que el coordinador las escriba", () => {
    const { container } = answer({ kind: "una", options: [], value: null })
    expect(container.textContent).toContain("No hay opciones para elegir: pídalas al coordinador")
    expect(button(container, "Elegir en Técnica").disabled).toBe(true)
  })

  it("bloqueada no deja elegir ni quitar", () => {
    const { container } = answer({ kind: "varias", options, value: ["o1"] }, true)
    expect(button(container, "Elegir en Técnica").disabled).toBe(true)
    expect(button(container, "Quitar «Clase magistral»").disabled).toBe(true)
  })
})

describe("Ajustes de la respuesta para el docente", () => {
  it("la ayuda se ve debajo y el texto respeta su límite de caracteres", () => {
    const { container } = answer({ kind: "texto", options: [], value: "", help: "Indique días y horas.", maxLength: 200 })
    expect(container.querySelector("[data-response-help]")!.textContent).toBe("Indique días y horas.")
    expect(container.querySelector('textarea[aria-label="Técnica"]')!.getAttribute("maxlength")).toBe("200")
    expect(answer({ kind: "texto", options: [], value: "" }).container.querySelector("[data-response-help]")).toBeNull()
  })

  it("elegir una como desplegable se responde con una lista desplegable", async () => {
    const { container, last } = answer({ kind: "una", options, value: null, display: "desplegable" })
    expect(container.querySelector("[data-response-dropdown]")).not.toBeNull()
    expect(container.querySelector('button[aria-label="Elegir en Técnica"][aria-haspopup="dialog"]')).toBeNull()
    const actor = userEvent.setup()
    await actor.click(screen.getByRole("combobox", { name: "Elegir en Técnica" }))
    await actor.click(await screen.findByRole("option", { name: "Taller" }))
    await flush()
    expect(last()).toBe("o2")
    expect(answer({ kind: "una", options, value: null }).container.querySelector("[data-response-dropdown]")).toBeNull()
  })

  it("elegir varias avisa cuántas elegir, no deja pasar del máximo y marca lo opcional", async () => {
    const { container, onValueChange } = answer({ kind: "varias", options, value: ["o1", "o2"], minChoices: 1, maxChoices: 2, required: false })
    expect(container.querySelector("[data-response-help]")!.textContent).toBe("Elija de 1 a 2 opciones · Opcional")
    fireEvent.click(button(container, "Elegir en Técnica"))
    await flush()
    await chooseOption(2)
    expect(onValueChange).not.toHaveBeenCalled()
  })
})

describe("El editor del docente con tipos de respuesta", () => {
  it("responde en el párrafo y en la celda sin poder escribir sobre la respuesta", async () => {
    setTemplateRuntime(definition as unknown as TemplateDefinitionPayload, {})
    const onValueChange = vi.fn()
    const { container, rerender } = render(<FieldResponseEditor id="campo" label="Estrategias" template={template} value={null} onValueChange={onValueChange} />)
    expect(container.textContent).toContain("Horas de tutoría:")
    expect(container.querySelector("input")).toBeNull()
    expect(container.querySelectorAll("textarea")).toHaveLength(2)

    fireEvent.change(container.querySelectorAll("textarea")[0]!, { target: { value: "8" } })
    let value = onValueChange.mock.calls.at(-1)![0] as DocumentNode
    expect(value.content![0]!.content![1]!.attrs!.value).toBe("8")
    rerender(<FieldResponseEditor id="campo" label="Estrategias" template={template} value={value} onValueChange={onValueChange} />)

    fireEvent.click(button(container, "Elegir en Técnica, fila 1"))
    await flush()
    await chooseOption(1)
    value = onValueChange.mock.calls.at(-1)![0] as DocumentNode
    expect(value.content![1]!.content![1]!.content![0]!.content![0]!.content![0]).toEqual(response("una", "o2"))
    expect(value.content![0]!.content![1]!.attrs!.value).toBe("8")
    expect(responseEmpty(template, value)).toBe(false)
    expect(responseEmpty(template, template)).toBe(true)
  })

  it("una tabla con respuestas sigue creciendo por filas y cada fila nueva llega sin contestar", () => {
    setTemplateRuntime(definition as unknown as TemplateDefinitionPayload, {})
    const answered: DocumentNode = JSON.parse(JSON.stringify(template))
    answered.content![1]!.content![1]!.content![0]!.content![0]!.content![0]!.attrs!.value = "o1"
    const onValueChange = vi.fn()
    const { container } = render(<FieldResponseEditor id="campo" label="Estrategias" template={template} value={answered} onValueChange={onValueChange} />)

    fireEvent.click([...container.querySelectorAll("button")].find((item) => item.textContent === "Agregar fila")!)
    const value = onValueChange.mock.calls.at(-1)![0] as DocumentNode
    expect(value.content![1]!.content).toHaveLength(3)
    expect(value.content![1]!.content![1]!.content![0]!.content![0]!.content![0]!.attrs!.value).toBe("o1")
    expect(value.content![1]!.content![2]!.content![0]!.content![0]!.content![0]).toEqual(response("una", null))
  })
})
