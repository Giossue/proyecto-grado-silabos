import { fireEvent, render } from "@testing-library/react"
import { createWrapper } from "@/test/render"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as templateApi from "@/api/template"
import { ApiError } from "@/api/client"
import type { DesignedTable, RepeatableTableDesign } from "@/api/template"
import { TemplateTableDesigner } from "@/components/domain/configuration/TemplateTableDesigner"
import { byLabel, chooseMenuItem, click, menuItems, mountBuilder, press, selectField, settle, typeInto } from "@/components/domain/configuration/templateBuilderTesting"
import { setTemplateRuntime, templateRuntime } from "@/lib/blocks/runtime"
import type { BlockDefinition, TemplateDefinitionPayload } from "@silabos/shared/lib/blocks/types"
import definition from "@silabos/shared/test/fixtures/template-definition.json"
import { emptyDocument } from "@/types/configuration"

vi.mock("@/api/template", async (original) => ({ ...(await original<typeof templateApi>()), designRepeatableTable: vi.fn(), importTemplateJson: vi.fn(), checkTemplateDraft: vi.fn(), getTemplateDraftImpact: vi.fn() }))

const books: RepeatableTableDesign = {
  kind: "bibliografia", label: "Bibliografía", list: "libros", item: "libro", min: 1, max: 40, initial: 1, band: null,
  columns: [
    { key: "autor", title: "Autor", type: "text", max_length: 1000, multiline: false, width: null, required: false },
    { key: "titulo", title: "Título", type: "text", max_length: 1000, multiline: false, width: null, required: true },
  ],
  extras: { rules: [], catalog: { list: "libros", map: { title: "titulo" } } },
}
const blockDefinition = (label: string): BlockDefinition => ({ label, props: {}, value: { filas: { type: "array", minItems: 1, maxItems: 10, initial: 2, items: { type: "object", properties: { tema: { type: "string", maxLength: 200, multiline: false } } } } }, rules: [], layout: [] })
const designed = (kind: string, design: RepeatableTableDesign): DesignedTable => ({ kind, definition: blockDefinition(design.label), design, initial: { filas: [{ tema: "" }, { tema: "" }] } })

const dialog = () => document.body.querySelector<HTMLElement>("[data-table-designer]")
const input = async (selector: string, value: string, index = 0) => {
  fireEvent.change(dialog()!.querySelectorAll<HTMLInputElement>(selector)[index]!, { target: { value } })
  await settle()
}
const mountDesigner = async (props: Partial<Parameters<typeof TemplateTableDesigner>[0]> = {}) => {
  const onApplied = vi.fn()
  const onOpenChange = vi.fn()
  render(<TemplateTableDesigner open templateId="t1" design={null} takenKinds={["bibliografia"]} onApplied={onApplied} onOpenChange={onOpenChange} {...props} />, { wrapper: createWrapper() })
  await settle()
  return { onApplied, onOpenChange }
}

describe("TemplateTableDesigner: tabla repetible sin JSON", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("crea una tabla nueva con columnas, tipos y límites de filas, y la muestra en vivo", async () => {
    vi.mocked(templateApi.designRepeatableTable).mockImplementation(async (_id, sent) => designed(sent.kind, sent))
    const { onApplied, onOpenChange } = await mountDesigner()

    await input("[data-table-label]", "Prácticas de laboratorio")
    await input("[data-table-item]", "práctica")
    await input("[data-table-max]", "10")
    await input("[data-table-initial]", "2")
    await input("[data-column-title]", "Tema")
    await input("[data-column-length]", "200")
    await input("[data-column-width]", "180")
    await click(dialog()!.querySelector("[data-column-required]"))
    await click(dialog()!.querySelector("[data-table-add-column]"))
    await input("[data-column-title]", "Horas", 1)

    const preview = dialog()!.querySelector("[data-table-preview]")!
    expect([...preview.querySelectorAll("th")].map((cell) => cell.textContent?.trim())).toEqual(["Tema *", "Horas"])
    expect(preview.querySelectorAll("tbody tr")).toHaveLength(2)
    expect(dialog()!.querySelector("[data-table-limits]")!.textContent).toBe("Entre 1 y 10 filas; el docente usa «Agregar práctica».")

    await click(dialog()!.querySelector("[data-table-apply]"))

    expect(templateApi.designRepeatableTable).toHaveBeenCalledWith("t1", {
      kind: "tabla_practicas_de_laboratorio", new: true, label: "Prácticas de laboratorio", list: "", item: "práctica", min: 1, max: 10, initial: 2, band: null,
      columns: [
        { title: "Tema", type: "text", width: 180, required: true, max_length: 200, multiline: false },
        { title: "Horas", type: "text", width: null, required: false, max_length: 1000, multiline: false },
      ],
    })
    expect(onApplied.mock.calls[0]![1]).toBe(true)
    expect(onOpenChange.mock.calls[0]).toEqual([false])
  })

  it("edita columnas y límites de una tabla existente y conserva lo que no muestra", async () => {
    vi.mocked(templateApi.designRepeatableTable).mockImplementation(async (_id, sent) => designed(sent.kind, sent))
    const { onApplied } = await mountDesigner({ design: books })

    await input("[data-table-max]", "20")
    await input("[data-column-title]", "Autores")
    await click(dialog()!.querySelectorAll("[data-column-remove]")[1])
    await click(dialog()!.querySelector("[data-table-apply]"))

    const sent = vi.mocked(templateApi.designRepeatableTable).mock.calls[0]![1]
    expect(sent).toMatchObject({ kind: "bibliografia", max: 20, extras: books.extras })
    expect(sent).not.toHaveProperty("new")
    expect(sent.columns).toEqual([{ key: "autor", title: "Autores", type: "text", width: null, required: false, max_length: 1000, multiline: false }])
    expect(onApplied.mock.calls[0]![1]).toBe(false)
  })

  it("sin cambios no pide nada al servidor y solo cierra", async () => {
    const { onApplied, onOpenChange } = await mountDesigner({ design: books })

    await click(dialog()!.querySelector("[data-table-apply]"))

    expect(templateApi.designRepeatableTable).not.toHaveBeenCalled()
    expect(onApplied).not.toHaveBeenCalled()
    expect(onOpenChange.mock.calls[0]).toEqual([false])
  })

  it("una tabla que no puede representar se abre solo para ver, con el motivo", async () => {
    await mountDesigner({ design: null, name: "Unidades", reason: "Tiene listas o grupos dentro de cada fila. Para cambiarla use Opciones avanzadas → Editar JSON." })

    expect(dialog()!.querySelector("[data-table-designer-readonly]")!.textContent).toContain("Tiene listas o grupos dentro de cada fila. Para cambiarla use Opciones avanzadas → Editar JSON.")
    expect(dialog()!.querySelector("form")).toBeNull()
    expect(dialog()!.querySelector("[data-table-apply]")).toBeNull()
    expect(dialog()!.textContent).toContain("Tabla repetible: Unidades")
  })

  it("explica en palabras simples que la búsqueda en biblioteca usa la columna quitada", async () => {
    const withIsbn: RepeatableTableDesign = { ...books, columns: [...books.columns, { key: "isbn", title: "ISBN", type: "text", max_length: 1000, multiline: false, width: null, required: false }], extras: { rules: [], catalog: { list: "libros", map: { title: "titulo", isbn: "isbn" } } } }
    vi.mocked(templateApi.designRepeatableTable).mockRejectedValue(new ApiError("Datos no válidos", 422, { definition: ["blocks.bibliografia.catalog.map.isbn: debe ser una columna de texto de la lista."] }))
    await mountDesigner({ design: withIsbn })

    await click(dialog()!.querySelectorAll("[data-column-remove]")[2])
    await click(dialog()!.querySelector("[data-table-apply]"))

    expect(dialog()!.querySelector("[data-table-designer-error]")!.textContent?.trim()).toBe("La búsqueda en biblioteca usa la columna «ISBN»: no se puede quitar.")
  })

  it("muestra junto a cada dato los errores que da el servidor", async () => {
    vi.mocked(templateApi.designRepeatableTable).mockRejectedValue(new ApiError("Datos no válidos", 422, {
      "columns.0.title": ["Escriba el nombre de la columna."],
      max: ["El máximo de filas no puede ser menor que el mínimo."],
      definition: ["blocks.bibliografia.catalog.map.isbn: debe ser una columna de texto de la lista."],
    }))
    const { onApplied } = await mountDesigner({ design: books })

    await input("[data-column-title]", "")
    await click(dialog()!.querySelector("[data-table-apply]"))

    expect(dialog()!.querySelector("[data-table-column]")!.textContent).toContain("Escriba el nombre de la columna")
    expect(dialog()!.textContent).toContain("El máximo de filas no puede ser menor que el mínimo")
    expect(dialog()!.querySelector("[data-table-designer-error]")!.textContent).toContain("blocks.bibliografia.catalog.map.isbn: debe ser una columna de texto de la lista")
    expect(onApplied).not.toHaveBeenCalled()
  })
})

describe("TemplateVisualBuilder: tabla repetible desde la cinta", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    setTemplateRuntime(definition as unknown as TemplateDefinitionPayload, {})
    vi.mocked(templateApi.importTemplateJson).mockResolvedValue({ message: "ok" })
    vi.mocked(templateApi.checkTemplateDraft).mockResolvedValue({ problems: [] })
    vi.mocked(templateApi.getTemplateDraftImpact).mockResolvedValue({ affected: false, in_progress: 0, keep: 0, lose: 0, back_to_draft: 0, careers: [] })
  })
  afterEach(() => { vi.useRealTimers() })

  const template = {
    id: "t1", name: "Plantilla", description: null, titleBlock: { text: "SÍLABO" },
    sections: [{ id: "s1", key: "uno", title: "Uno", orientation: "portrait" as const, fields: [
      { id: "f1", key: "f1", label: "Primero", quien_llena: "carrera" as const, content: emptyDocument() },
      { id: "f2", key: "f2", label: "Libros", quien_llena: "carrera" as const, content: { type: "doc", content: [{ type: "documentBlock", attrs: { kind: "bibliografia", props: {}, value: {} } }] } },
    ] }],
  }
  const mountEditing = () => mountBuilder({ template, blockDesigns: { bibliografia: { design: books, reason: null } } })
  const save = async () => {
    await click([...document.body.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Guardar"))
  }

  it("la tabla creada se pone en el campo elegido y viaja al guardar como cambio de bloque", async () => {
    await mountEditing()
    await selectField("f1")
    const table = designed("tabla_practicas", { ...books, kind: "tabla_practicas", label: "Prácticas", list: "filas" })
    vi.mocked(templateApi.designRepeatableTable).mockResolvedValue(table)

    await press(byLabel("Tabla repetible"))
    await chooseMenuItem("Nueva tabla repetible")
    await input("[data-table-label]", "Prácticas")
    await click(dialog()!.querySelector("[data-table-apply]"))

    expect(templateRuntime().definition?.blocks.tabla_practicas?.label).toBe("Prácticas")
    await save()
    const sent = vi.mocked(templateApi.importTemplateJson).mock.calls[0]![1] as templateApi.TemplateDraftPayload
    expect(sent.block_changes).toEqual({ tabla_practicas: table.definition })
    expect(sent.sections[0]!.fields[0]!.content).toEqual({ type: "doc", content: [{ type: "documentBlock", attrs: { kind: "tabla_practicas", props: {}, value: table.initial } }] })
  })

  it("la cinta ofrece editar las tablas del campo y guardar sin tocarlas no manda cambios de bloque", async () => {
    await mountEditing()
    await selectField("f2")

    await press(byLabel("Tabla repetible"))
    expect(menuItems().filter((item) => item.hasAttribute("data-table-edit")).map((item) => [item.getAttribute("data-table-edit"), item.textContent?.trim()])).toEqual([["bibliografia", "Editar «Bibliografía»"]])
    await typeInto("Sección Uno", "Uno nuevo")
    await save()

    expect(vi.mocked(templateApi.importTemplateJson).mock.calls[0]![1]).not.toHaveProperty("block_changes")
  })

  it("al pulsar un campo con tabla, el panel lateral ofrece editarla y abre el diseñador", async () => {
    await mountEditing()
    expect(document.body.querySelector("[data-template-panel]")).toBeNull()
    await selectField("f2")

    const panel = document.body.querySelector<HTMLElement>("[data-template-panel]")!
    expect(panel.getAttribute("aria-label")).toBe("Opciones del campo")
    const edit = panel.querySelector<HTMLButtonElement>('[data-panel-table="bibliografia"]')!
    expect(edit.textContent?.trim()).toBe("Editar «Bibliografía»")
    await click(edit)

    expect(dialog()!.textContent).toContain("Tabla repetible: Bibliografía")
  })
})
