// @vitest-environment node
import { describe, expect, it } from "vitest"
import { templateFields, type TemplateField } from "../configuration/templatePresentation"
import { officialDefinition, officialSections } from "../configuration/officialTemplate"
import type { TemplateDefinition } from "../configuration/templateRuntime"
import { AI_BLOCKED_NOBODY, AI_BLOCKED_PROTECTED, aiBlockReason, aiReadableFields, holdsDisabilityData, initialAiReadableKeys } from "./readableFields"
import { officialTemplate } from "./testing"

const template = officialTemplate()
const fields = templateFields(template)
const definition = template.definition
const byKey = (key: string): TemplateField => fields.find((field) => field.key === key)!
const keys = (found: TemplateField[]) => found.map((field) => field.key)
const everyKey = new Set(fields.map((field) => field.key))
const paragraph = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Texto" }] }] }
const identificationBlock = { type: "documentBlock", attrs: { kind: "identificacion", props: [], value: [] } }

describe("AI-readable fields", () => {
  it("reads no field without an explicit permission", () => {
    expect(aiReadableFields(definition, fields, new Set())).toEqual([])
    expect(keys(aiReadableFields(definition, fields, new Set(["descripcion"])))).toEqual(["descripcion"])
  })

  it("ignores a permission for a field that is not in the template", () => {
    expect(aiReadableFields(definition, fields, new Set(["campo_retirado"]))).toEqual([])
  })

  it("never reads the field that holds the identification table, even with a permission", () => {
    expect(holdsDisabilityData(byKey("asignatura").content, definition)).toBe(true)
    expect(keys(aiReadableFields(definition, fields, everyKey))).not.toContain("asignatura")
    expect(aiBlockReason(byKey("asignatura"), definition)).toBe(AI_BLOCKED_PROTECTED)
  })

  it("stops reading an enabled field as soon as its content gains the identification table, also inside a table", () => {
    const description = byKey("descripcion")
    const gained = { ...description, content: { type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [identificationBlock] }] }] }] } }

    expect(keys(aiReadableFields(definition, [description], new Set(["descripcion"])))).toEqual(["descripcion"])
    expect(aiReadableFields(definition, [gained], new Set(["descripcion"]))).toEqual([])
  })

  it("blocks a renamed table that still asks for disability data, stored disability values and tables it cannot identify", () => {
    const renamed = { ...definition, blocks: { ...definition.blocks, datos_generales: definition.blocks.identificacion, apoyos: { label: "Apoyos", value: { tipo: { type: "string", title: "Tipo de discapacidad" } } } } } as TemplateDefinition
    const holding = (kind: string, value: unknown = []) => ({ type: "doc", content: [{ type: "documentBlock", attrs: { kind, props: [], value } }] })

    expect(holdsDisabilityData(holding("datos_generales"), renamed)).toBe(true)
    expect(holdsDisabilityData(holding("apoyos"), renamed)).toBe(true)
    expect(holdsDisabilityData(holding("bibliografia", { disability: { answer: "si" } }), definition)).toBe(true)
    expect(holdsDisabilityData(holding("tabla_desconocida"), definition)).toBe(true)
    expect(holdsDisabilityData(holding("bibliografia"), definition)).toBe(false)
    expect(holdsDisabilityData(holding("unidades"), definition)).toBe(false)
    expect(holdsDisabilityData(paragraph, definition)).toBe(false)
    expect(holdsDisabilityData(null, definition)).toBe(false)
  })

  it("never reads a field nobody fills", () => {
    const fixed = byKey("indicadores_evaluacion")

    expect(fixed.responsible).toBe("institucional")
    expect(aiReadableFields(definition, [fixed], everyKey)).toEqual([])
    expect(aiBlockReason(fixed, definition)).toBe(AI_BLOCKED_NOBODY)
    expect(aiBlockReason(byKey("descripcion"), definition)).toBeNull()
  })

  it("starts with the current Coordinación and teacher fields on, except «Formación y experiencia», the identification table and the fixed texts", () => {
    expect(initialAiReadableKeys(officialSections(), officialDefinition())).toEqual([
      "nombre_campus",
      "correquisitos_asignatura",
      "descripcion",
      "objetivo_general",
      "objetivos_especificos",
      "resultados_aprendizaje",
      "habilidades_blandas",
      "unidades",
      "metodologia",
      "tecnicas_ensenanza",
      "recursos_medios",
      "herramientas_tic",
      "ambientes_aprendizaje",
      "contribucion_perfil",
      "conducta_etica",
      "bibliografia",
      "bibliografia_complementaria",
    ])
  })
})
