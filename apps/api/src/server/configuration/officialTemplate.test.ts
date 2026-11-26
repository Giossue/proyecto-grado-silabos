// @vitest-environment node
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { officialDefinition, officialSections } from "./officialTemplate"
import { phpShape, type PhpRecord } from "./phpValues"
import type { SyllabusTemplate } from "./templatePresentation"
import { templateExport } from "./templateReads"
import { RULE_CATALOG } from "./templateShortForm"

const here = __dirname

function file(name: string): string {
  return readFileSync(path.join(here, name), "utf8")
}

function officialTemplate(): SyllabusTemplate {
  const definition = officialDefinition()
  return {
    id: "01a1c5ba-10b4-7129-925f-6f0b8c3d2e11",
    modifiedAt: null,
    definition,
    sections: officialSections().map((section, s) => ({
      id: `section-${s}`,
      key: section.key,
      title: section.title,
      orientation: section.orientation,
      position: s + 1,
      blocks: section.fields.map((field, f) => ({
        id: `block-${s}-${f}`,
        key: field.key,
        title: field.label ?? field.key,
        position: f + 1,
        fields: [{ id: `field-${s}-${f}`, blockId: `block-${s}-${f}`, key: field.key, label: field.label ?? field.key, responsible: field.responsible, content: field.content }],
      })),
    })),
  }
}

describe("official template seed", () => {
  it("produces the same internal definition and sections as before", () => {
    expect(JSON.stringify(officialDefinition(), null, 2)).toBe(file("__fixtures__/official-definition.json"))
    expect(JSON.stringify(officialSections(), null, 2)).toBe(file("__fixtures__/official-sections.json"))
  })

  it("is written exactly as the Spanish export of the official template", () => {
    const seed = JSON.parse(file("officialTemplate.json")) as PhpRecord
    const exported = JSON.parse(JSON.stringify(phpShape(templateExport(new Request("https://silabos.ueb.edu.ec/"), officialTemplate(), officialDefinition())))) as PhpRecord
    expect(seed.$schema).toBe("./plantilla.schema.json")
    expect({ ...seed, $schema: null }).toEqual({ ...exported, $schema: null })
    expect(Object.keys(seed)).toEqual(Object.keys(exported))
    expect(file("officialTemplate.json")).toBe(`${JSON.stringify({ ...exported, $schema: "./plantilla.schema.json" }, null, 4)}\n`)
  })

  it("keeps the six known rules by name", () => {
    expect(Object.keys(RULE_CATALOG)).toEqual(["semanas_maximas", "unidades_sin_nombre", "unidades_sin_semanas", "semanas_unidades_incompletas", "horas_unidades_no_coinciden", "libros_sin_titulo"])
  })
})
