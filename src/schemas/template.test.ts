// @vitest-environment node
import { describe, expect, it } from "vitest"
import { schemaErrors } from "./issues"
import { assistantRequestSchema, excludedColumnPath, sectionOrderSchema, sectionSchema, tableDesignSchema, templateDraftSchema, templateFieldSchema } from "./template"

const UUID = "01a1c5ba-2222-7000-8000-999999999999"

describe("template structure schemas", () => {
  it("validate sections, their keys and their order", async () => {
    expect(await schemaErrors(sectionSchema(["datos"]), { title: "Datos", key: "datos" })).toEqual({ key: ["La clave ya está siendo utilizada por otra sección."] })
    expect(await schemaErrors(sectionOrderSchema([UUID]), { section_ids: [UUID, "01a1c5ba-2222-7000-8000-000000000000"] })).toEqual({
      "section_ids.1": ["La sección seleccionada no pertenece a la plantilla."],
    })
  })

  it("validate template fields", async () => {
    expect(await schemaErrors(templateFieldSchema({ creating: true, keyAvailable: async () => false }), { quien_llena: "docente", content: {}, type: "x", key: "campo" })).toEqual({
      quien_llena: ["El valor seleccionado en quién lo llena no es válido."],
      content: ["El campo contenido es obligatorio."],
      type: ["El campo tipo retirado está prohibido."],
      key: ["El valor del campo clave ya está en uso."],
    })
  })
})

describe("tableDesignSchema", () => {
  const design = { kind: "libros", label: "Libros", item: "libro", min: 1, max: 3, initial: 4 }

  it("compares the rows and only checks the settings of each column type", async () => {
    const input = { ...design, columns: [{ title: "Tema", type: "choice", options: [{ label: "Uno" }, { label: " uno " }] }, { title: "Horas", type: "number", maximum: 0, decimals: 0, max_length: "x" }] }
    expect(await schemaErrors(tableDesignSchema(input), input)).toEqual({
      initial: ["«Al empezar» debe estar entre el mínimo y el máximo."],
      "columns.0.options.1.label": ["La opción está repetida."],
      "columns.1.maximum": ["El campo número máximo debe ser mayor que 0."],
    })
    expect(excludedColumnPath(input, "columns.1.max_length")).toBe(true)
    expect(excludedColumnPath(input, "columns.1.maximum")).toBe(false)
  })

  it("asks for columns", async () => {
    expect(await schemaErrors(tableDesignSchema(design), { ...design, initial: 2 })).toEqual({ columns: ["Agregue al menos una columna."] })
  })
})

describe("templateDraftSchema", () => {
  const schema = templateDraftSchema({ formatVersion: 2, choices: () => ["11"], repeatedFieldKey: () => [], contentFailures: (_, attribute) => [`Contenido de ${attribute}`] })

  it("orders layout errors right after the layout, as the editor expects", async () => {
    const errors = await schemaErrors(schema, { version: 3, layout: { body_font_size: 12 }, lists: "x", sections: [{ key: "a", title: "A", fields: [{ key: "b", quien_llena: "carrera", content: "x" }] }] })
    expect(Object.keys(errors)).toEqual(["version", "layout.body_font_size", "lists", "sections.0.fields.0.content"])
    expect(errors["sections.0.fields.0.content"]).toEqual(["Contenido de sections.0.fields.0.content"])
  })
})

describe("assistantRequestSchema", () => {
  it("checks every section and field of the draft", async () => {
    const schema = assistantRequestSchema({ messageCharacters: 10, readable: () => false, unreadable: "Ilegible" })
    expect(await schemaErrors(schema, { message: "hola", idempotency_key: UUID, draft_version: "1", draft: [{ key: "a", orientation: "portrait", fields: [{ key: "b", quien_llena: "carrera", content: [] }] }] })).toEqual({
      "draft.0.title": ["El campo título de la sección debe estar presente."],
      "draft.0.fields.0.label": ["El campo nombre del campo debe estar presente."],
      "draft.0.fields.0.content": ["El campo contenido es obligatorio."],
    })
  })
})
