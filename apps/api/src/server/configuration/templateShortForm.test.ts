// @vitest-environment node
import { describe, expect, it } from "vitest"
import { defineBlock } from "./blockDefinition"
import { documentLines } from "./documentHtml"
import { officialDefinition, officialSections } from "./officialTemplate"
import { phpShape, type PhpRecord } from "./phpValues"
import { buildTable, designWithKeys } from "./repeatableTable"
import { defineTemplate } from "./templateDefinition"
import { DraftRequest, prepareDraft, toRuntime } from "./templateDraft"
import type { SyllabusTemplate } from "./templatePresentation"
import { templateExport } from "./templateReads"
import { TemplateValidationError, type TemplateDefinition } from "./templateRuntime"

const request = new Request("https://silabos.ueb.edu.ec/")

function officialTemplate(definition: TemplateDefinition = officialDefinition()): SyllabusTemplate {
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

function asJson(value: unknown): PhpRecord {
  return JSON.parse(JSON.stringify(phpShape(value))) as PhpRecord
}

function exported(definition: TemplateDefinition = officialDefinition()): PhpRecord {
  return asJson(templateExport(request, officialTemplate(definition), definition))
}

function imported(payload: PhpRecord, current: TemplateDefinition = officialDefinition()): TemplateDefinition {
  return new DraftRequest(prepareDraft(toRuntime(payload) as PhpRecord), current).definition()
}

function fullBlocks(definition: TemplateDefinition): PhpRecord {
  return Object.fromEntries(
    Object.entries(definition.blocks).map(([kind, raw]) => {
      const block = raw as PhpRecord
      const parts: PhpRecord = { label: block.label }
      for (const part of ["props", "value", "rules"]) {
        const value = block[part]
        if (!(Array.isArray(value) && value.length === 0) && !(typeof value === "object" && value !== null && Object.keys(value).length === 0)) parts[part] = value
      }
      if (block.catalog !== undefined) parts.catalog = block.catalog
      parts.layout = documentLines({ type: "doc", content: block.layout })
      return [kind, parts]
    }),
  )
}

function blocksOf(payload: PhpRecord): Record<string, PhpRecord> {
  return payload.blocks as Record<string, PhpRecord>
}

function definitionErrors(work: () => unknown): string[] {
  try {
    work()
  } catch (error) {
    if (error instanceof TemplateValidationError) return Object.values(error.errors).flat()
    throw error
  }
  return []
}

function practicesBlock(variables: string[]): PhpRecord {
  const design = designWithKeys({
    kind: "practicas",
    label: "Prácticas de laboratorio",
    list: "practicas",
    item: "práctica",
    min: 1,
    max: 10,
    initial: 2,
    band: "#E1E9F4",
    columns: [
      { title: "Tema", type: "text", max_length: 200, multiline: false, width: 200, required: true },
      { title: "Modalidad", type: "choice", options: [{ label: "Presencial" }, { label: "Virtual" }], width: null, required: false },
      { title: "Horas", type: "number", maximum: 99, decimals: 0, width: null, required: false },
      { title: "Observación", type: "text", max_length: 1000, multiline: true, width: null, required: false },
    ],
  })
  return defineBlock("practicas", buildTable(design), variables)
}

describe("template JSON blocks in short form", () => {
  it("exports the official blocks in short form and imports them back to the identical definition", () => {
    const definition = officialDefinition()
    const payload = exported(definition)
    const blocks = blocksOf(payload)

    expect(Object.keys(blocks)).toEqual(["identificacion", "unidades", "evaluacion", "bibliografia"])
    for (const block of Object.values(blocks)) {
      expect(block).toHaveProperty("titulo")
      expect(block).not.toHaveProperty("label")
      expect(block).toHaveProperty("diseño")
    }
    expect(imported(payload)).toEqual(definition)
    expect(imported(payload).blocks).toEqual(definition.blocks)
  })

  it("names the known rules and writes the common column types with their defaults", () => {
    const blocks = blocksOf(exported())
    const units = blocks.unidades

    expect(units.reglas).toEqual(["semanas_maximas", "unidades_sin_nombre", "unidades_sin_semanas", "semanas_unidades_incompletas", "horas_unidades_no_coinciden"])
    expect(blocks.bibliografia.reglas).toEqual(["libros_sin_titulo"])
    const list = (units.campos as PhpRecord).units as PhpRecord
    expect(list).toMatchObject({ titulo: "unidad", filas: "1-8", al_empezar: 4, error: "La planificación admite de 1 a 8 unidades." })
    const columns = list.columnas as PhpRecord
    expect(columns.nombre).toEqual({ titulo: "Nombre de la unidad", error: "El nombre de la unidad supera los 1000 caracteres." })
    expect(columns.resultado).toEqual({ tipo: "texto largo", titulo: "Resultados de aprendizaje", error: "El resultado de aprendizaje supera los 1000 caracteres." })
    const weeks = columns.semanas as PhpRecord
    expect(weeks).toMatchObject({ titulo: "semana", filas: "0-52", al_empezar: 4 })
    expect((weeks.columnas as PhpRecord).acd_h).toEqual({ tipo: "número", titulo: "ACD", error: "Las horas por semana deben ser un número." })
    const disability = ((blocks.identificacion.campos as PhpRecord).disability as PhpRecord).campos as PhpRecord
    expect(disability.answer).toEqual({ tipo: "sí/no", titulo: "Estudiantes con discapacidad", error: "La respuesta sobre estudiantes con discapacidad no es válida." })
    expect(disability.description).toEqual({
      tipo: "texto largo",
      titulo: "Breve descripción",
      error: "El texto sobre discapacidad admite hasta 500 caracteres.",
      solo_si: { value: "answer", equals: "si" },
      max: 500,
    })
    expect(blocks.bibliografia.catalogo).toEqual({
      lista: "libros",
      columnas: { author: "autor", title: "titulo", year: "anio", place: "ciudad", publisher: "editorial", isbn: "isbn", format: "codigo" },
    })
    expect(blocks.evaluacion).toEqual({ titulo: "Indicadores de evaluación por parcial", diseño: expect.any(Array) })
  })

  it("exports an admin-designed table in short form and imports it back to the same block", () => {
    const official = officialDefinition()
    const practices = practicesBlock(Object.keys(official.variables))
    const definition: TemplateDefinition = { ...official, blocks: { ...official.blocks, practicas: practices } }

    const block = blocksOf(exported(definition)).practicas
    const columns = ((block.campos as PhpRecord).practicas as PhpRecord).columnas as PhpRecord

    expect(block.titulo).toBe("Prácticas de laboratorio")
    expect(columns.tema).toEqual({ titulo: "Tema", max: 200 })
    expect(columns.modalidad).toEqual({ titulo: "Modalidad", opciones: { presencial: "Presencial", virtual: "Virtual" } })
    expect(columns.horas).toEqual({ tipo: "número", titulo: "Horas", max: 99, decimales: 0 })
    expect(columns.observacion).toEqual({ tipo: "texto largo", titulo: "Observación" })
    expect((block.reglas as PhpRecord[])[0]).toMatchObject({ code: "tema_obligatoria", on: "submit" })
    expect(imported(exported(definition), definition).blocks).toEqual(definition.blocks)
  })

  it("imports a JSON exported in the full form before the short form existed to the same definition", () => {
    const definition = officialDefinition()
    const practices = practicesBlock(Object.keys(definition.variables))
    const withTable: TemplateDefinition = { ...definition, blocks: { ...definition.blocks, practicas: practices } }
    const payload = { ...exported(withTable), blocks: asJson(fullBlocks(withTable)) }

    expect(imported(payload, withTable)).toEqual(withTable)
  })

  it("keeps a rule that differs from the catalog as a full object", () => {
    const official = officialDefinition()
    const units = official.blocks.unidades as PhpRecord
    const rules = structuredClone(units.rules) as PhpRecord[]
    rules[0] = { ...rules[0], message: "Hay más semanas que en el período." }
    const definition: TemplateDefinition = { ...official, blocks: { ...official.blocks, unidades: { ...units, rules } } }

    const reglas = blocksOf(exported(definition)).unidades.reglas as unknown[]

    expect(reglas[0]).toEqual({ code: "semanas_maximas", on: "save", message: "Hay más semanas que en el período.", checks: [{ count: "units.*.semanas", max: { variable: "semanas_periodo" } }] })
    expect(reglas.slice(1)).toEqual(["unidades_sin_nombre", "unidades_sin_semanas", "semanas_unidades_incompletas", "horas_unidades_no_coinciden"])
    expect(imported(exported(definition), definition).blocks).toEqual(definition.blocks)
  })

  it("reports an invalid short form in Spanish with its path", () => {
    const variables = officialDefinition().variables
    const layout = ["<table>", "<tr data-repeat='{\"value\":\"filas\"}'><td><span data-slot='{\"value\":\"tema\"}'></span></td></tr>", "</table>"]
    const define = (block: PhpRecord) => definitionErrors(() => defineTemplate(toRuntime({ variables, blocks: { practicas: block } })))
    const table = (column: unknown, extra: PhpRecord = {}) => ({ titulo: "Prácticas", campos: { filas: { filas: "1-5", columnas: { tema: column }, ...extra } }, diseño: layout })

    expect(define({ ...table("texto"), campos: { filas: { filas: "ocho", columnas: { tema: "texto" } } } })).toEqual([
      "blocks.practicas.campos.filas.filas: escriba el mínimo y el máximo de filas, por ejemplo «1-8».",
    ])
    expect(define(table("fecha"))).toEqual(["blocks.practicas.campos.filas.columnas.tema: use «texto», «texto largo», «número», «horas» o «sí/no»."])
    expect(define(table({ titulo: "Tema", color: "rojo" }))).toEqual(["blocks.practicas.campos.filas.columnas.tema: clave desconocida «color»."])
    expect(define(table({ titulo: "x".repeat(301) }))).toEqual(["blocks.practicas.campos.filas.columnas.tema.titulo: escriba un texto de hasta 300 caracteres."])
    expect(define(table({ tipo: "número", decimales: 9 }))).toEqual(["blocks.practicas.campos.filas.columnas.tema.decimales: use un número entero de 0 a 6."])
    expect(define({ ...table("texto"), reglas: ["inventada"] })).toEqual([
      "blocks.practicas.reglas.0: «inventada» no es una regla conocida. Use semanas_maximas, unidades_sin_nombre, unidades_sin_semanas, semanas_unidades_incompletas, horas_unidades_no_coinciden o libros_sin_titulo, o escriba la regla completa.",
    ])
    expect(define({ ...table("texto"), titulo: "" })).toEqual(["blocks.practicas.titulo: escriba el nombre del bloque (hasta 120 caracteres)."])
    expect(define({ ...table("texto"), diseño: null })).toEqual(["blocks.practicas.diseño: el diseño es una lista de líneas HTML o de nodos."])
    expect(define({ ...table("texto"), color: "rojo" })).toEqual(["blocks.practicas: clave desconocida «color». Use titulo, propiedades, campos, reglas, catalogo y diseño."])
  })

  it("makes the exported blocks substantially shorter", () => {
    const definition = officialDefinition()
    const lines = (value: unknown) => JSON.stringify(value, null, 2).split("\n").length
    const before = lines(asJson(fullBlocks(definition)))
    const after = lines(blocksOf(exported(definition)))

    expect(after).toBeLessThan(before * 0.6)
  })
})
