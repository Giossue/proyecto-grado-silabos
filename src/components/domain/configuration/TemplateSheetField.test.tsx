import { fireEvent, render } from "@testing-library/react"
import type { Editor } from "@tiptap/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { TemplateField } from "@/api/template"
import { TemplateFormatTools } from "@/components/domain/configuration/TemplateFormatTools"
import { TemplateSheetField } from "@/components/domain/configuration/TemplateSheetField"
import { setTemplateRuntime } from "@/lib/blocks/runtime"
import type { TemplateDefinitionPayload } from "@/lib/blocks/types"
import { nodesOfType, type DocumentNode, type TemplateVariable } from "@/lib/templateDocument"
import definition from "@/test/fixtures/template-definition.json"
import { flush } from "@/test/render"

const official = definition as unknown as TemplateDefinitionPayload
const variables: TemplateVariable[] = [
  { key: "nombre_facultad", label: "Nombre de la facultad", sample: "Ciencias" },
  { key: "nombre_asignatura", label: "Nombre de la asignatura", sample: "Calidad" },
]
const paragraph = (content: DocumentNode[]): DocumentNode => ({ type: "doc", content: [{ type: "paragraph", content }] })
const field = (content: DocumentNode, quien_llena: TemplateField["quien_llena"] = "carrera"): TemplateField => ({ id: "f1", key: "f1", label: "Asignatura", quien_llena, content })
const mountField = async (content: DocumentNode, quien_llena: TemplateField["quien_llena"] = "carrera") => {
  const onFieldChange = vi.fn()
  const onSelect = vi.fn()
  render(<TemplateSheetField field={field(content, quien_llena)} locked={false} variables={variables} onFieldChange={onFieldChange} onSelect={onSelect} />)
  await flush()
  const editor = (): Editor => {
    fireEvent.pointerDown(document.body.querySelector("[data-field-editor]")!)
    return onSelect.mock.calls.at(-1)![0] as Editor
  }
  return { editor, lastField: (): TemplateField => onFieldChange.mock.calls.at(-1)![0] as TemplateField }
}
const variableIds = (value: DocumentNode): unknown[] => nodesOfType(value, "variable").map((node) => node.attrs?.id)

describe("datos del sistema en el editor de la plantilla", () => {
  beforeEach(() => {
    setTemplateRuntime(official, Object.fromEntries(variables.map((variable) => [variable.key, ""])))
    Object.defineProperty(Range.prototype, "getClientRects", { value: () => Object.assign([], { item: () => null }), configurable: true })
    Object.defineProperty(Range.prototype, "getBoundingClientRect", { value: () => new DOMRect(0, 0, 0, 0), configurable: true })
  })
  afterEach(() => {
    Reflect.deleteProperty(Range.prototype, "getClientRects")
    Reflect.deleteProperty(Range.prototype, "getBoundingClientRect")
  })

  it("inserta un dato del sistema desde la cinta", async () => {
    const host = await mountField(paragraph([{ type: "text", text: "Hola " }]))
    const editor = host.editor()
    editor.commands.focus("end")
    render(<TemplateFormatTools editor={editor} variables={variables} />)
    await flush()
    const trigger = document.body.querySelector<HTMLElement>('[aria-label="Insertar dato del sistema"]')!
    expect(trigger).not.toBeNull()
    fireEvent.keyDown(trigger, { key: "Enter" })
    await flush()
    fireEvent.click([...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((element) => element.textContent?.trim() === "Nombre de la facultad")!)
    await flush()
    expect(variableIds(host.lastField().content)).toEqual(["nombre_facultad"])
    expect(nodesOfType(host.lastField().content, "variable")[0]!.attrs?.label).toBe("Nombre de la facultad")
  })

  it("inserta un dato del sistema escribiendo «/»", async () => {
    const host = await mountField(paragraph([{ type: "text", text: "Hola" }]))
    host.editor().chain().focus("end").insertContent(" /asig").run()
    await flush()
    const options = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')]
    expect(options.map((option) => option.textContent?.trim())).toEqual(["Nombre de la asignatura"])
    fireEvent.mouseDown(options[0]!)
    await flush()
    const value = host.lastField().content
    expect(variableIds(value)).toEqual(["nombre_asignatura"])
    expect(nodesOfType(value, "text").map((node) => node.text).join("")).not.toContain("/asig")
  })

  it("la ficha del campo muestra el nombre real del dato", async () => {
    await mountField(paragraph([{ type: "variable", attrs: { id: "nombre_facultad", label: "" } }]))
    const chip = document.body.querySelector("[data-field-body] .document-variable")!
    expect(chip.textContent).toBe("Nombre de la facultad")
  })

  it("las celdas de la tabla de identificación muestran el nombre real del dato", async () => {
    await mountField({ type: "doc", content: [{ type: "documentBlock", attrs: { kind: "identificacion", props: {}, value: {} } }] }, "institucional")
    const chips = [...document.body.querySelectorAll("[data-block] .document-variable")].map((element) => element.textContent)
    expect(chips).toContain("Nombre de la facultad")
    expect(document.body.querySelector("[data-block]")!.textContent).not.toContain("Dato del sistema")
  })
})
