import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { SyllabusDetail, SyllabusField } from "@/api/syllabi"
import { SyllabusTeacherForm } from "@/components/domain/syllabus/SyllabusTeacherForm"
import { TeacherEditsToggle } from "@/components/domain/syllabus/TeacherEditsToggle"
import { keepTeacherEdits, withoutDocumentMarks } from "@/lib/teacherEdits"
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

describe("la casilla de Coordinación", () => {
  it("se activa y avisa cuando el campo tiene espacios", () => {
    const onChange = vi.fn()
    const { rerender } = render(<TeacherEditsToggle id="f1" document={doc("Texto")} onChange={onChange} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "El docente puede editar este texto" }))
    expect(onChange).toHaveBeenCalledWith(true)
    rerender(<TeacherEditsToggle id="f1" document={space} onChange={onChange} />)
    expect(screen.getByRole("checkbox", { name: "El docente puede editar este texto" }).hasAttribute("disabled")).toBe(true)
    expect(screen.getByText("Quite los espacios de respuesta para activarla")).toBeTruthy()
  })

  it("la marca acompaña al texto, no llega al editor y se quita al agregar un espacio", () => {
    const marked = keepTeacherEdits(doc("Nuevo"), true)
    expect(marked.attrs).toEqual({ teacherEdits: true })
    expect(withoutDocumentMarks(marked)).toEqual(doc("Nuevo"))
    expect(keepTeacherEdits(space, true).attrs).toBeUndefined()
    expect(keepTeacherEdits(marked, false).attrs).toBeUndefined()
  })
})
