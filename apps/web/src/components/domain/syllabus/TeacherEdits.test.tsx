import { createRef } from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { SyllabusDetail, SyllabusField } from "@/api/syllabi"
import { SyllabusTeacherForm } from "@/components/domain/syllabus/SyllabusTeacherForm"
import { FreeTextEditor, type FreeTextEditorHandle } from "@/components/domain/syllabus/FreeTextEditor"
import { keepDocumentMarks, withoutDocumentMarks } from "@/lib/teacherEdits"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"
import { flush } from "@/test/render"

const doc = (text: string): DocumentNode => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })
const space: DocumentNode = { type: "doc", content: [{ type: "paragraph", content: [{ type: "response", attrs: { kind: "texto", options: [], value: null } }] }] }

const field = (patch: Partial<SyllabusField> = {}): SyllabusField => ({
  id: "f1", key: "etica", label: "Conducta", quien_llena: "carrera", teacher_editable: true, required: true,
  teacher_edits: true, value: doc("Texto de Coordinación"), ...patch,
})
const sections = (item: SyllabusField): SyllabusDetail["sections"] => [{ id: "s1", key: "etica", title: "10. Ética", description: null, orientation: "portrait", fields: [item] }]
const button = (name: string) => screen.queryByRole("button", { name })

describe("el docente y un texto que puede editar", () => {
  it("lo recibe en un editor", async () => {
    render(<SyllabusTeacherForm sections={sections(field())} />)
    await flush()
    await vi.waitFor(() => expect(screen.getByRole("textbox", { name: "Conducta" }).textContent).toContain("Texto de Coordinación"))
  })

  it("con el texto ya cambiado no muestra avisos ni botones bajo el editor", async () => {
    render(<SyllabusTeacherForm sections={sections(field({ value: doc("Mi texto") }))} />)
    await flush()
    expect(button("Restaurar texto original")).toBeNull()
    expect(button("Usar texto nuevo")).toBeNull()
  })
})

describe("las marcas antiguas del proyecto de carrera", () => {
  it("acompañan al texto guardado, no llegan al editor y la de editar se quita al agregar un espacio", () => {
    const current: DocumentNode = { ...doc("Texto"), attrs: { teacherEdits: true } }
    const next = keepDocumentMarks(doc("Nuevo"), current, doc("Plantilla"))
    expect(next.attrs).toEqual({ teacherEdits: true })
    expect(withoutDocumentMarks(next)).toEqual(doc("Nuevo"))
    expect(keepDocumentMarks(space, current, doc("Plantilla")).attrs).toBeUndefined()
  })

  it("la de una tabla vacía se quita al escribir en ella sin perder lo escrito", () => {
    const current: DocumentNode = { ...doc("Plantilla"), attrs: { teacherFills: true } }
    expect(keepDocumentMarks(doc("Escrito"), current, doc("Plantilla"))).toEqual(doc("Escrito"))
  })
})

describe("los encabezados de las tablas en el editor", () => {
  it("no dejan escribir ni borrar, y las celdas sí", async () => {
    const paragraph = (text: string): DocumentNode => ({ type: "paragraph", content: [{ type: "text", text }] })
    const grid: DocumentNode = { type: "doc", content: [{ type: "table", content: [
      { type: "tableRow", content: [{ type: "tableHeader", content: [paragraph("Encabezado")] }] },
      { type: "tableRow", content: [{ type: "tableCell", content: [paragraph("Celda")] }] },
    ] }] }
    const ref = createRef<FreeTextEditorHandle>()
    render(<FreeTextEditor id="t" label="Tabla" value={grid} spaces allowTables={false} ref={ref} />)
    await vi.waitFor(() => expect(ref.current?.editor).toBeTruthy())
    const editor = ref.current!.editor!
    const positionOf = (text: string): number => {
      let found = -1
      editor.state.doc.descendants((node, position) => {
        if (node.isText && node.text === text) found = position
      })
      return found
    }
    editor.commands.insertContentAt(positionOf("Encabezado"), "X")
    editor.commands.deleteRange({ from: positionOf("Encabezado"), to: positionOf("Encabezado") + 3 })
    expect(editor.getText()).toContain("Encabezado")
    expect(editor.getText()).not.toContain("XEncabezado")
    editor.commands.insertContentAt(positionOf("Celda"), "Y")
    expect(editor.getText()).toContain("YCelda")
  })
})

describe("recargar el borrador", () => {
  it("al volver a habilitar el editor no reenvía el texto viejo por encima del nuevo", async () => {
    const onValueChange = vi.fn()
    const ref = createRef<FreeTextEditorHandle>()
    const editor = (value: DocumentNode, disabled: boolean) => <FreeTextEditor id="t" label="Texto" value={value} disabled={disabled} onValueChange={onValueChange} ref={ref} />
    const view = render(editor(doc("Texto viejo de esta pestaña"), true))
    await vi.waitFor(() => expect(ref.current?.editor).toBeTruthy())
    await flush()
    view.rerender(editor(doc("Texto nuevo guardado en el servidor"), false))
    await flush()
    expect(onValueChange).not.toHaveBeenCalled()
    expect(ref.current!.editor!.getText()).toContain("Texto nuevo guardado en el servidor")
    expect(ref.current!.editor!.isEditable).toBe(true)
  })
})
