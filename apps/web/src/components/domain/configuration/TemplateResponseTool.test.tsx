import { fireEvent, render } from "@testing-library/react"
import type { Editor } from "@tiptap/core"
import { createRef } from "react"
import { describe, expect, it, vi } from "vitest"
import type { TemplateField } from "@/api/template"
import { TemplateFieldContent } from "@/components/domain/configuration/TemplateFieldContent"
import { TemplateResponseTool } from "@/components/domain/configuration/TemplateResponseTool"
import { FreeTextEditor, type FreeTextEditorHandle } from "@/components/domain/syllabus/FreeTextEditor"
import type { ConditionSource } from "@/lib/responseConditions"
import { nodesOfType, type DocumentNode } from "@silabos/shared/lib/templateDocument"
import { flush } from "@/test/render"

const cellDocument: DocumentNode = { type: "doc", content: [{ type: "table", content: [
  { type: "tableRow", content: [{ type: "tableHeader", attrs: { colspan: 1, rowspan: 1 }, content: [{ type: "paragraph", content: [{ type: "text", text: "Modalidad" }] }] }] },
  { type: "tableRow", content: [{ type: "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: [{ type: "paragraph" }] }] },
] }] }
const editorFor = async (content: DocumentNode) => {
  const handle = createRef<FreeTextEditorHandle>()
  const onValueChange = vi.fn()
  render(<FreeTextEditor ref={handle} id="campo" label="Campo" value={content} toolbar={false} onValueChange={onValueChange} />)
  await flush()

  return { editor: handle.current!.editor!, last: (): DocumentNode => onValueChange.mock.calls.at(-1)![0] as DocumentNode }
}
const mountTool = (editor: Editor | null, allowed = true) => render(<TemplateResponseTool editor={editor} allowed={allowed} />)
const open = async (tool: ReturnType<typeof mountTool>): Promise<void> => {
  fireEvent.click(tool.container.querySelector('button[aria-label="Tipo de respuesta"]')!)
  await flush()
}
const pick = async (label: string): Promise<void> => {
  fireEvent.click([...document.querySelectorAll<HTMLElement>('[role="radio"]')].find((item) => item.textContent?.trim() === label)!)
  await flush()
}
const write = async (label: string, text: string): Promise<void> => {
  fireEvent.change(document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!, { target: { value: text } })
  await flush()
}
const type = async (selector: string, text: string): Promise<void> => {
  fireEvent.change(document.querySelector<HTMLInputElement>(selector)!, { target: { value: text } })
  await flush()
}
const press = async (selector: string): Promise<void> => {
  fireEvent.click(document.querySelector<HTMLButtonElement>(selector)!)
  await flush()
}

describe("Tipo de respuesta en la cinta de la plantilla", () => {
  it("convierte la celda donde está el cursor en una respuesta de elegir, con las opciones escritas ahí mismo", async () => {
    const { editor, last } = await editorFor(cellDocument)
    let cell = -1
    editor.state.doc.descendants((node, position) => { if (node.type.name === "tableCell") cell = position })
    editor.commands.setTextSelection(cell + 2)
    const tool = mountTool(editor)

    await open(tool)
    expect([...document.querySelectorAll('[role="radio"]')].map((item) => item.textContent?.trim())).toEqual(["Texto libre", "Elegir una", "Elegir varias"])
    await pick("Elegir una")
    await write("Opción 1", "  Presencial ")
    await press("[data-response-add-option]")
    await write("Opción 2", "En línea")
    await press("[data-response-insert]")

    expect(nodesOfType(nodesOfType(last(), "tableCell")[0]!, "response").map((node) => node.attrs)).toEqual([
      { kind: "una", options: [{ const: "o1", title: "Presencial" }, { const: "o2", title: "En línea" }], value: null },
    ])
  })

  it("sin «Insertar» (Coordinación), el espacio seleccionado en el editor cambia en su mismo sitio", async () => {
    const { editor, last } = await editorFor({ type: "doc", content: [{ type: "paragraph", content: [
      { type: "text", text: "Lugar: " }, { type: "response", attrs: { kind: "una", options: [{ const: "o1", title: "Aula" }], value: null } }, { type: "text", text: " y horario" },
    ] }] })
    let at = -1
    editor.state.doc.descendants((node, position) => { if (node.type.name === "response") at = position })
    editor.commands.setNodeSelection(at)
    const tool = render(<TemplateResponseTool editor={editor} advanced={false} />)
    await open(tool)
    expect(document.querySelector('[role="radio"][aria-checked="true"]')!.textContent!.trim()).toBe("Elegir una")
    await write("Opción 1", "Campo")
    await press("[data-response-add-option]")
    await write("Opción 2", "Taller")

    expect(document.querySelector("[data-response-insert]")).toBeNull()
    expect(nodesOfType(last(), "response").map((node) => JSON.parse(JSON.stringify(node.attrs)))).toEqual([
      { kind: "una", options: [{ const: "o1", title: "Campo" }, { const: "o2", title: "Taller" }], value: null },
    ])
    expect(nodesOfType(last(), "text").map((node) => node.text)).toEqual(["Lugar: ", " y horario"])
  })

  it("en la plantilla de Administración la variable sigue en una línea con su tipo", async () => {
    const { editor } = await editorFor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "response", attrs: { kind: "una", options: [{ const: "o1", title: "Aula" }], value: null } }] }] })

    expect(editor.view.dom.querySelector(".document-response")!.textContent).toBe("Elegir una: Aula")
    expect(editor.view.dom.querySelector(".document-response__option")).toBeNull()
  })

  it("en el campo del coordinador no entra una segunda variable, ni pegándola", async () => {
    const handle = createRef<FreeTextEditorHandle>()
    render(<FreeTextEditor ref={handle} id="campo" label="Campo" value={{ type: "doc", content: [{ type: "paragraph" }] }} spaces />)
    await flush()
    const editor = handle.current!.editor!
    const space = { type: "response", attrs: { kind: "una", options: [], value: null } }
    editor.commands.insertContent(space)
    editor.commands.insertContent(space)

    expect(nodesOfType(editor.getJSON() as DocumentNode, "response")).toHaveLength(1)
  })

  it("un texto libre no pide opciones y un campo Institucional no admite tipos de respuesta", async () => {
    const { editor, last } = await editorFor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Horas: " }] }] })
    const blocked = mountTool(editor, false)
    expect(blocked.container.querySelector<HTMLButtonElement>('button[aria-label="Tipo de respuesta"]')!.disabled).toBe(true)
    blocked.unmount()

    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    const tool = mountTool(editor)
    await open(tool)
    await pick("Texto libre")
    expect(document.querySelector('input[aria-label="Opción 1"]')).toBeNull()
    await press("[data-response-insert]")

    expect(last().content![0]!.content).toEqual([{ type: "text", text: "Horas: " }, { type: "response", attrs: { kind: "texto", options: [], value: "" } }])
  })

  it("en «Más opciones» marca si es obligatoria, la ayuda y el límite de caracteres", async () => {
    const { editor, last } = await editorFor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Horario: " }] }] })
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    const tool = mountTool(editor)
    await open(tool)
    await pick("Texto libre")
    await press("[data-response-more]")
    await press("[data-response-required]")
    await type("[data-response-help]", "Indique días y horas.")
    await type("[data-response-max-length]", "5000")
    expect(document.querySelector("[data-response-settings-error]")!.textContent).toContain("El límite de caracteres va de 1 a 3000.")
    expect(document.querySelector<HTMLButtonElement>("[data-response-insert]")!.disabled).toBe(true)
    await type("[data-response-max-length]", "500")
    await press("[data-response-insert]")

    expect(JSON.parse(JSON.stringify(nodesOfType(last(), "response")[0]!.attrs))).toEqual({ kind: "texto", options: [], value: "", required: false, help: "Indique días y horas.", maxLength: 500 })
  })

  it("elegir una puede ir como desplegable", async () => {
    const { editor, last } = await editorFor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Lugar: " }] }] })
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    const tool = mountTool(editor)
    await open(tool)
    await pick("Elegir una")
    await write("Opción 1", "Aula")
    await press("[data-response-more]")
    await pick("Desplegable")
    await press("[data-response-insert]")
    expect(JSON.parse(JSON.stringify(nodesOfType(last(), "response")[0]!.attrs))).toEqual({ kind: "una", options: [{ const: "o1", title: "Aula" }], value: null, display: "desplegable" })
  })

  it("elegir varias guarda cuántas elegir dentro del número de opciones", async () => {
    const { editor, last } = await editorFor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Lugar: " }] }] })
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    const tool = mountTool(editor)
    await open(tool)
    await pick("Elegir varias")
    await write("Opción 1", "Aula")
    await press("[data-response-add-option]")
    await write("Opción 2", "Campo")
    await press("[data-response-more]")
    await type("[data-response-min]", "3")
    expect(document.querySelector("[data-response-settings-error]")!.textContent).toContain("Cuántas elegir va de 1 a 2, el número de opciones.")
    await type("[data-response-min]", "1")
    await type("[data-response-max]", "2")
    await press("[data-response-insert]")
    expect(JSON.parse(JSON.stringify(nodesOfType(last(), "response")[0]!.attrs))).toEqual({ kind: "varias", options: [{ const: "o1", title: "Aula" }, { const: "o2", title: "Campo" }], value: [], minChoices: 1, maxChoices: 2 })
  })

  it("en la plantilla, una respuesta de elegir recibe identificador y se muestra solo si otra anterior tiene la opción elegida", async () => {
    const question: DocumentNode = { type: "response", attrs: { kind: "una", options: [{ const: "o1", title: "Sí" }, { const: "o2", title: "No" }], value: null } }
    const { editor, last } = await editorFor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "¿Usa laboratorio? " }, question, { type: "text", text: " Cuál: " }] }] })
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    const claimed: string[] = []
    const other: ConditionSource = { id: null, label: "Campo anterior", options: [{ const: "o1", title: "Aula" }], field: "f0", index: 0 }
    const tool = render(<TemplateResponseTool editor={editor} sources={[other]} usedIds={["r_usado"]} claimSource={(source) => { claimed.push(source.field); return "r_otro" }} />)
    await open(tool)
    await pick("Elegir una")
    await write("Opción 1", "Química")
    await press("[data-response-more]")
    expect(document.querySelector("[data-condition-hint]")!.textContent).toBe("Si queda oculta, se oculta toda su línea")
    fireEvent.keyDown(document.querySelector<HTMLElement>("[data-condition-source]")!, { key: "Enter" })
    await flush()
    expect([...document.querySelectorAll('[role="option"]')].map((item) => item.textContent?.trim())).toEqual(["Siempre", "Campo anterior", "Usa laboratorio"])
    fireEvent.keyDown(document.querySelectorAll<HTMLElement>('[role="option"]')[2]!, { key: "Enter" })
    await flush()
    expect(document.querySelector("[data-response-condition-error]")!.textContent).toContain("Elija al menos una opción")
    await press('[data-condition-option="o1"]')
    await press("[data-response-insert]")

    const responses = nodesOfType(last(), "response").map((node) => JSON.parse(JSON.stringify(node.attrs)))
    const sourceId = responses[0].id as string
    expect(sourceId).toMatch(/^r_[a-z0-9]+$/)
    expect(responses[1]).toEqual({ kind: "una", options: [{ const: "o1", title: "Química" }], value: null, id: expect.stringMatching(/^r_[a-z0-9]+$/), showIf: { response: sourceId, options: ["o1"] } })
    expect(responses[1].id).not.toBe(sourceId)
    expect(claimed).toEqual([])
  })
})

describe("Tipo de respuesta en la hoja de la plantilla", () => {
  it("la plantilla nombra el tipo mientras se edita y no lo imprime en la vista previa", () => {
    const field: TemplateField = { id: "f1", key: "modalidad", label: "Modalidad", quien_llena: "carrera", content: { type: "doc", content: [
      { type: "paragraph", content: [{ type: "response", attrs: { kind: "una", options: [{ const: "o1", title: "Presencial" }, { const: "o2", title: "En línea" }], value: null } }] },
      { type: "paragraph", content: [{ type: "text", text: "Horas: " }, { type: "response", attrs: { kind: "texto", options: [], value: "" } }] },
    ] } }
    const editing = render(<TemplateFieldContent field={field} />)
    expect(editing.container.querySelector("[data-field-body]")!.textContent).toContain("Elegir una: Presencial · En línea")
    expect(editing.container.querySelector("[data-field-body]")!.textContent).toContain("Texto libre")

    const preview = render(<TemplateFieldContent field={field} preview />)
    expect(preview.container.querySelector("[data-field-body]")!.textContent).not.toContain("Elegir una")
    expect(preview.container.querySelector("[data-field-body]")!.textContent).toContain("Horas:")
  })
})

describe("el engranaje de Coordinación en un campo con tabla", () => {
  const choose = async (editor: Editor, label: string) => {
    const tool = render(<TemplateResponseTool editor={editor} advanced={false} />)
    await open(tool)
    await pick(label)
  }
  const cellAt = (editor: Editor, type: string): number => {
    let found = -1
    editor.state.doc.descendants((node, position) => { if (node.type.name === type) found = position })
    return found + 2
  }
  const shape = (editor: Editor) => nodesOfType(editor.getJSON() as DocumentNode, "table").length

  it.each(["Texto libre", "Elegir varias"])("«%s» se coloca dentro de la celda vacía y no reemplaza la tabla", async (label) => {
    const { editor } = await editorFor(cellDocument)
    editor.commands.setTextSelection(cellAt(editor, "tableCell"))
    await choose(editor, label)

    expect(shape(editor)).toBe(1)
    expect(nodesOfType(nodesOfType(editor.getJSON() as DocumentNode, "tableCell")[0]!, "response")).toHaveLength(1)
  })

  it.each(["Texto libre", "Elegir varias"])("«%s» fuera de una celda vacía no cambia nada y lo explica", async (label) => {
    const { editor } = await editorFor(cellDocument)
    editor.commands.setTextSelection(cellAt(editor, "tableHeader"))
    const before = JSON.stringify(editor.getJSON())
    await choose(editor, label)

    expect(JSON.stringify(editor.getJSON())).toBe(before)
    expect(document.querySelector("[data-response-cell-error]")!.textContent).toBe("Haga clic en una celda vacía de la tabla y vuelva a elegir el tipo de respuesta")
    expect(document.querySelector('[role="radio"][aria-checked="true"]')).toBeNull()
  })

  it("en un campo sin tabla «Texto libre» sigue dejando todo el campo al docente", async () => {
    const { editor } = await editorFor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Texto anterior" }] }] })
    await choose(editor, "Texto libre")

    expect(editor.getText()).not.toContain("Texto anterior")
    expect(nodesOfType(editor.getJSON() as DocumentNode, "response")).toHaveLength(1)
  })
})
