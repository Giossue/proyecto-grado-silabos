import { fireEvent, render } from "@testing-library/react"
import type { Editor } from "@tiptap/core"
import { createRef } from "react"
import { describe, expect, it, vi } from "vitest"
import type { SyllabusDetail } from "@/api/syllabi"
import { FieldResponseEditor } from "@/components/domain/syllabus/FieldResponseEditor"
import { FreeTextEditor, type FreeTextEditorHandle } from "@/components/domain/syllabus/FreeTextEditor"
import { SyllabusTeacherForm } from "@/components/domain/syllabus/SyllabusTeacherForm"
import { fieldCharacters } from "@/lib/fieldLimits"
import type { DocumentNode } from "@/lib/templateDocument"
import { flush } from "@/test/render"

type Section = SyllabusDetail["sections"][number]
const doc = (...lines: string[]): DocumentNode => ({ type: "doc", content: lines.map((line) => (line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" })) })
const blank = doc("")
const answer = (value: string): DocumentNode => ({ type: "doc", content: [
  { type: "paragraph", content: [{ type: "text", text: "Detalle: " }, { type: "response", attrs: { kind: "texto", options: [], value: value as never } }] },
  { type: "paragraph" },
] })
const section = (value: DocumentNode, limit?: number, template: DocumentNode = blank): Section[] => [{
  id: "s1", key: "uno", title: "Uno", description: null, orientation: "portrait",
  fields: [{ id: "f1", key: "descripcion", label: "Descripción", quien_llena: "carrera", teacher_editable: true, required: true, template, value, ...(limit ? { max_length: limit } : {}) }],
}]
const paste = (editor: Editor, text: string): void => { editor.view.pasteText(text, new Event("paste") as ClipboardEvent) }
const freeText = async (value: DocumentNode, limit: number) => {
  const handle = createRef<FreeTextEditorHandle>()
  const onValueChange = vi.fn()
  render(<FreeTextEditor ref={handle} id="libre" label="Contenido" value={value} limit={limit} onValueChange={onValueChange} />)
  await flush()

  return { editor: handle.current!.editor!, last: (): DocumentNode => onValueChange.mock.calls.at(-1)![0] as DocumentNode }
}

describe("Límite de caracteres del docente", () => {
  it("muestra el contador bajo el campo, en rojo al llegar y con aviso si se pasó", async () => {
    const { container, rerender } = render(<SyllabusTeacherForm sections={section(doc("Hola mundo"), 20)} />)
    await flush()
    const counter = (): Element => container.querySelector('[data-field-counter="f1"]')!
    expect(counter().textContent).toBe("10 / 20")
    expect(counter()).toHaveClass("text-muted-foreground")

    rerender(<SyllabusTeacherForm sections={section(doc("Hola mundo", "Hola mundo"), 20)} />)
    await flush()
    expect(counter().textContent).toBe("20 / 20")
    expect(counter()).toHaveClass("text-destructive")

    rerender(<SyllabusTeacherForm sections={section(doc("Hola mundo", "Hola mundo", "más"), 20)} />)
    await flush()
    expect(counter().textContent).toBe("23 / 20 · Supera el límite: recorte el texto para enviar")
    expect(container.querySelector("#field-f1")!.getAttribute("data-invalid")).toBe("true")
  })

  it("sin límite no hay contador", async () => {
    const { container } = render(<SyllabusTeacherForm sections={section(doc("Hola mundo"))} />)
    await flush()
    expect(container.querySelector("[data-field-counter]")).toBeNull()
  })

  it("el editor de texto libre no acepta más texto al escribir ni al pegar", async () => {
    const { editor, last } = await freeText(doc("Hola"), 10)

    editor.chain().focus("end").insertContent(" mundo").run()
    expect(editor.getText()).toBe("Hola mundo")
    editor.chain().focus("end").insertContent("!").run()
    expect(editor.getText()).toBe("Hola mundo")

    editor.chain().setTextSelection({ from: 1, to: 5 }).run()
    paste(editor, "Adiós, adiós")
    expect(editor.getText()).toBe("Adió mundo")
    editor.commands.selectAll()
    paste(editor, "12345678901234")
    expect(editor.getText()).toBe("1234567890")
    expect(fieldCharacters(blank, last())).toBe(10)
  })

  it("lo que ya pasaba el límite se puede recortar pero no crecer", async () => {
    const { editor } = await freeText(doc("Hola mundo largo"), 10)

    editor.chain().focus("end").insertContent("!").run()
    expect(editor.getText()).toBe("Hola mundo largo")
    editor.chain().focus("end").deleteRange({ from: 11, to: 17 }).run()
    expect(editor.getText()).toBe("Hola mundo")
  })

  it("en un campo con espacios, cada espacio recibe solo lo que queda del límite, también al pegar", async () => {
    const template = answer("")
    const onValueChange = vi.fn()
    const { container } = render(<FieldResponseEditor id="campo" label="Métodos" template={template} value={answer("Química")} limit={12} onValueChange={onValueChange} />)
    await flush()
    const last = (): DocumentNode => onValueChange.mock.calls.at(-1)![0] as DocumentNode
    const [response, slot] = [...container.querySelectorAll("textarea")]
    expect(response!.getAttribute("maxlength")).toBe("12")
    expect(slot!.getAttribute("maxlength")).toBe("5")

    fireEvent.change(slot!, { target: { value: "Laboratorio" } })
    const written = last()
    expect(written.content![1]!.content).toEqual([{ type: "text", text: "Labor" }])
    expect(fieldCharacters(template, written)).toBe(12)

    fireEvent.change(response!, { target: { value: "Química orgánica" } })
    expect((last().content![0]!.content![1]!.attrs as { value: string }).value).toBe("Química orgá")
  })
})
