import { createRef } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { SyllabusDetail, SyllabusField } from "@/api/syllabi"
import { FieldResponseEditor } from "@/components/domain/syllabus/FieldResponseEditor"
import { FreeTextEditor, type FreeTextEditorHandle } from "@/components/domain/syllabus/FreeTextEditor"
import { SyllabusTeacherForm } from "@/components/domain/syllabus/SyllabusTeacherForm"
import { documentTables, templateRows } from "@/lib/fieldResponses"
import { nodesOfType, type DocumentNode } from "@silabos/shared/lib/templateDocument"
import { flush } from "@/test/render"

const paragraph = (text: string): DocumentNode => (text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" })
const cell = (type: string, content: DocumentNode): DocumentNode => ({ type, attrs: { colspan: 1, rowspan: 1 }, content: [content] })
const head = (...texts: string[]): DocumentNode => ({ type: "tableRow", content: texts.map((text) => cell("tableHeader", paragraph(text))) })
const row = (...texts: string[]): DocumentNode => ({ type: "tableRow", content: texts.map((text) => cell("tableCell", paragraph(text))) })
const grid = (...rows: DocumentNode[]): DocumentNode => ({ type: "doc", content: [{ type: "table", content: [head("Actividad", "Horas"), ...rows] }] })
const list = grid(row("", ""))
const fixed = grid(row("Teoría", ""), row("Práctica", ""))

const bodyRows = (document: DocumentNode): number => documentTables(document)[0]!.content!.length - 1
const positionOf = (handle: FreeTextEditorHandle, type: string, index: number): number => {
  const found: number[] = []
  handle.editor!.state.doc.descendants((node, position) => {
    if (node.type.name === type) found.push(position)
  })
  return found[index]! + 2
}
const cursorIn = async (handle: FreeTextEditorHandle, type: string, index: number): Promise<void> => {
  await act(async () => {
    handle.editor!.commands.setTextSelection(positionOf(handle, type, index))
  })
}
const button = (name: string) => screen.queryByRole("button", { name }) as HTMLButtonElement | null
const click = async (name: string): Promise<void> => {
  fireEvent.click(button(name)!)
  await flush()
}
const ready = async (handle: { current: FreeTextEditorHandle | null }): Promise<FreeTextEditorHandle> => {
  await vi.waitFor(() => expect(handle.current?.editor).toBeTruthy())
  await flush()
  return handle.current!
}
const current = (handle: FreeTextEditorHandle): DocumentNode => handle.editor!.getJSON() as DocumentNode

describe("filas en el editor del proyecto de carrera y del docente", () => {
  const mount = async (document: DocumentNode, admin: DocumentNode, onValueChange = vi.fn()) => {
    const ref = createRef<FreeTextEditorHandle>()
    render(<FreeTextEditor id="t" label="Tabla" value={document} allowTables={false} spaces rowTables={templateRows(admin)} ref={ref} onValueChange={onValueChange} />)
    return { handle: await ready(ref), onValueChange }
  }

  it("agrega y quita filas, nunca menos de una", async () => {
    const { handle, onValueChange } = await mount(list, list)
    await cursorIn(handle, "tableCell", 0)
    expect(button("Quitar fila")!.disabled).toBe(true)
    await click("Agregar fila")
    expect(bodyRows(current(handle))).toBe(2)
    expect(bodyRows(onValueChange.mock.calls.at(-1)![0] as DocumentNode)).toBe(2)
    await cursorIn(handle, "tableCell", 2)
    await click("Quitar fila")
    expect(bodyRows(current(handle))).toBe(1)
    expect(button("Quitar fila")!.disabled).toBe(true)
  })

  it("quita la fila donde está el cursor y no los encabezados", async () => {
    const { handle } = await mount(grid(row("Lectura", "2"), row("Foro", "1")), list)
    await cursorIn(handle, "tableHeader", 0)
    expect(button("Quitar fila")!.disabled).toBe(true)
    await cursorIn(handle, "tableCell", 0)
    await click("Quitar fila")
    expect(handle.editor!.getText()).toContain("Foro")
    expect(handle.editor!.getText()).not.toContain("Lectura")
  })

  it("la fila nueva copia el espacio de respuesta de la fila de la plantilla", async () => {
    const answer: DocumentNode = { type: "paragraph", content: [{ type: "response", attrs: { kind: "una", options: [{ const: "o1", title: "Aula" }], value: null } }] }
    const admin: DocumentNode = grid({ type: "tableRow", content: [cell("tableCell", answer), cell("tableCell", paragraph(""))] })
    const { handle } = await mount(admin, admin)
    await click("Agregar fila")
    expect(nodesOfType(current(handle), "response")).toHaveLength(2)
  })

  it("una tabla de filas fijas no ofrece agregar ni quitar filas y sigue protegida", async () => {
    const { handle } = await mount(fixed, fixed)
    expect(button("Agregar fila")).toBeNull()
    expect(button("Quitar fila")).toBeNull()
    await cursorIn(handle, "tableCell", 0)
    await act(async () => {
      handle.editor!.commands.addRowAfter()
    })
    expect(bodyRows(current(handle))).toBe(2)
  })

  it("en una tabla que admite filas tampoco se tocan columnas, encabezados ni la última fila", async () => {
    const { handle } = await mount(list, list)
    for (const change of [() => handle.editor!.commands.addColumnAfter(), () => handle.editor!.commands.deleteRow(), () => handle.editor!.commands.deleteTable()]) {
      await cursorIn(handle, "tableCell", 0)
      const before = JSON.stringify(current(handle))
      await act(async () => {
        change()
      })
      expect(JSON.stringify(current(handle))).toBe(before)
    }
    await act(async () => {
      handle.editor!.commands.insertContentAt(positionOf(handle, "tableHeader", 0), "X")
    })
    expect(handle.editor!.getText()).not.toContain("XActividad")
  })

  it("Coordinación recibe los botones según la tabla de la plantilla", async () => {
    render(<FieldResponseEditor id="c" label="Carga" career template={list} value={grid(row("Lectura", "2"))} />)
    await vi.waitFor(() => expect(button("Agregar fila")).toBeTruthy())
    expect(button("Quitar fila")).toBeTruthy()
  })
})

describe("el docente con permiso de editar", () => {
  const field = (patch: Record<string, unknown>) =>
    ({ id: "f1", key: "carga", label: "Carga", quien_llena: "carrera", teacher_editable: true, required: true, teacher_edits: true, value: grid(row("Lectura", "2")), ...patch }) as unknown as SyllabusField
  const sections = (item: SyllabusField): SyllabusDetail["sections"] => [{ id: "s1", key: "carga", title: "Carga", description: null, orientation: "portrait", fields: [item] }]

  it("agrega una fila vacía en una tabla que admite filas", async () => {
    const onValueChange = vi.fn()
    render(<SyllabusTeacherForm sections={sections(field({ row_tables: [true] }))} onValueChange={onValueChange} />)
    await vi.waitFor(() => expect(button("Agregar fila")).toBeTruthy())
    await click("Agregar fila")
    const written = onValueChange.mock.calls.at(-1)![1] as DocumentNode
    expect(bodyRows(written)).toBe(2)
    expect(JSON.stringify(documentTables(written)[0]!.content![2])).not.toContain("Lectura")
  })

  it("no la ofrece en una tabla de filas fijas", async () => {
    render(<SyllabusTeacherForm sections={sections(field({}))} />)
    await vi.waitFor(() => expect(screen.getByRole("textbox", { name: "Carga" })).toBeTruthy())
    await flush()
    expect(button("Agregar fila")).toBeNull()
  })
})
