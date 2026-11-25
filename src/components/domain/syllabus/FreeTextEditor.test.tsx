import { fireEvent, render, waitFor } from "@testing-library/react"
import type { Editor } from "@tiptap/core"
import { createRef } from "react"
import { describe, expect, it, vi } from "vitest"
import { FreeTextEditor, type FreeTextEditorHandle } from "@/components/domain/syllabus/FreeTextEditor"
import { nodesOfType, type DocumentNode } from "@/lib/templateDocument"
import { flush } from "@/test/render"

const doc = (text: string): DocumentNode => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })
const variables = [{ key: "nombre_asignatura", label: "Asignatura", sample: "Calidad" }]
const mountEditor = (value: DocumentNode | null = null, disabled = false) => {
  const handle = createRef<FreeTextEditorHandle>()
  const onValueChange = vi.fn()
  const element = (next: { value: DocumentNode | null; disabled: boolean }) => (
    <FreeTextEditor ref={handle} id="libre" label="Contenido" value={next.value} disabled={next.disabled} variables={variables} onValueChange={onValueChange} />
  )
  const view = render(element({ value, disabled }))

  return {
    ...view,
    onValueChange,
    editor: (): Editor => handle.current!.editor!,
    last: (): DocumentNode => onValueChange.mock.calls.at(-1)![0] as DocumentNode,
    update: (next: { value?: DocumentNode | null; disabled?: boolean }) => view.rerender(element({ value: next.value === undefined ? value : next.value, disabled: next.disabled ?? disabled })),
  }
}

describe("Editor de documentos compartido", () => {
  it("ofrece texto con formato, listas, tablas y variables sin seleccionar tipo", async () => {
    const { container } = mountEditor()
    await flush()
    expect(container.querySelector('[role="toolbar"]')).not.toBeNull()
    for (const label of ["Negrita", "Cursiva", "Subrayado", "Lista con viñetas", "Lista numerada", "Insertar tabla"]) expect(container.querySelector(`[aria-label="${label}"]`)).not.toBeNull()
    expect(container.querySelector('[role="textbox"]')!.getAttribute("aria-label")).toBe("Contenido")
    expect(container.querySelector('[aria-label="Insertar dato del sistema"]')).not.toBeNull()
  })

  it("actualiza el nombre accesible del contenido cuando cambia la etiqueta", async () => {
    const element = (label: string) => <FreeTextEditor id="libre" label={label} value={null} variables={variables} />
    const view = render(element("Contenido de Campo sin nombre"))
    await flush()
    view.rerender(element("Contenido de Campo A"))
    await flush()
    view.rerender(element("Contenido de Campo A"))
    await flush()
    expect(view.container.querySelector('[role="textbox"]')!.getAttribute("aria-label")).toBe("Contenido de Campo A")
  })

  it("guarda el color del texto elegido y lo conserva al volver a abrir", async () => {
    const first = mountEditor(doc("Unidad No."))
    await flush()
    first.editor().chain().selectAll().setColor("#365F91").run()
    await flush()
    const value = first.last()
    const text = nodesOfType(value, "text")[0]!
    expect(text.marks).toEqual([{ type: "textStyle", attrs: expect.objectContaining({ color: "#365F91" }) }])

    const reopened = mountEditor(value)
    await flush()
    expect(reopened.container.querySelector('[role="textbox"] span[style]')!.getAttribute("style")).toContain("color")
  })

  it("el texto del docente queda siempre a la izquierda, aunque venga alineado", async () => {
    const justified: DocumentNode = { type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "justify" }, content: [{ type: "text", text: "Justificado" }] }] }
    const { container, editor, last } = mountEditor(justified)
    await flush()
    for (const label of ["Alinear a la izquierda", "Centrar", "Alinear a la derecha", "Justificar"]) expect(container.querySelector(`[aria-label="${label}"]`)).toBeNull()
    expect(container.querySelector('[role="textbox"] p')!.getAttribute("style") ?? "").not.toContain("text-align")
    editor().commands.insertContent(" más")
    await flush()
    expect(nodesOfType(last(), "paragraph")[0]!.attrs?.textAlign).toBeUndefined()
  })

  it("la plantilla del administrador sí conserva la alineación", async () => {
    const justified: DocumentNode = { type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "justify" }, content: [{ type: "text", text: "Justificado" }] }] }
    const { container } = render(<FreeTextEditor id="plantilla" label="Plantilla" value={justified} toolbar={false} align />)
    await flush()
    expect(container.querySelector('[role="textbox"] p')!.getAttribute("style")).toContain("text-align: justify")
  })

  it("añade filas y columnas y guarda los totales como texto sin cálculo", async () => {
    const { container, editor, last } = mountEditor()
    await flush()
    editor().commands.insertTable({ rows: 2, cols: 2, withHeaderRow: false })
    editor().commands.insertContent("999")
    editor().commands.addRowAfter()
    editor().commands.addColumnAfter()
    await flush()
    expect(nodesOfType(last(), "tableRow")).toHaveLength(3)
    expect(nodesOfType(last(), "tableRow")[0]!.content).toHaveLength(3)
    expect(nodesOfType(last(), "text").map((node) => node.text)).toContain("999")
    await waitFor(() => {
      const labels = [...container.querySelectorAll('[role="toolbar"] button')].map((button) => button.textContent)
      expect(labels).toEqual(expect.arrayContaining(["+ Fila", "− Fila", "+ Columna", "− Columna", "Combinar", "Separar", "Encabezado", "Quitar tabla"]))
    })
  })

  it("muestra «Agregar fila» cuando el campo trae una tabla y la agrega al final sin poner el cursor en ella", async () => {
    const cell = (text: string) => ({ type: "tableCell", content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }] })
    const value: DocumentNode = { type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [cell("Autor"), cell("Título")] }, { type: "tableRow", content: [cell(""), cell("")] }] }] }
    const { container, last } = mountEditor(value)
    await flush()
    fireEvent.click([...container.querySelectorAll("button")].find((button) => button.textContent === "Agregar fila")!)
    await flush()
    expect(nodesOfType(last(), "tableRow")).toHaveLength(3)
    const other = mountEditor(doc("sin tabla"))
    await flush()
    expect([...other.container.querySelectorAll("button")].some((button) => button.textContent === "Agregar fila")).toBe(false)
  })

  it("conserva celdas combinadas, estilos y variables al escribir", async () => {
    const value: DocumentNode = { type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", attrs: { colspan: 2, rowspan: 1, colwidth: [100, 200], backgroundColor: "#DBE5F1", textColor: "#0070C0", bold: true }, content: [{ type: "paragraph", content: [{ type: "variable", attrs: { id: "nombre_asignatura" } }] }] }] }] }] }
    const { container, editor } = mountEditor(value)
    await flush()
    editor().commands.insertContent({ type: "paragraph", content: [{ type: "text", text: "Más contenido" }] })
    const current = editor().getJSON() as DocumentNode
    expect(nodesOfType(current, "tableCell")[0]?.attrs).toMatchObject({ colspan: 2, colwidth: [100, 200], backgroundColor: "#DBE5F1", bold: true })
    expect(nodesOfType(current, "variable")[0]?.attrs?.id).toBe("nombre_asignatura")
    expect(container.querySelector('[data-variable="nombre_asignatura"]')!.textContent).toBe("Asignatura")
  })

  it("sincroniza cambios externos sin disparar autoguardado", async () => {
    const { editor, update, onValueChange } = mountEditor(doc("Inicial"))
    await flush()
    update({ value: doc("Actualizado") })
    await flush()
    expect(editor().getText()).toBe("Actualizado")
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it("deshabilita documento y controles durante una pausa", async () => {
    const { container, editor, update } = mountEditor(doc("Contenido"), true)
    await flush()
    expect(editor().isEditable).toBe(false)
    for (const button of container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button')) expect(button.disabled).toBe(true)
    update({ disabled: false })
    await flush()
    expect(editor().isEditable).toBe(true)
  })
})
