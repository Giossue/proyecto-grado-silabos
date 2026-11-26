// @vitest-environment node
import { describe, expect, it } from "vitest"
import { defineBlock } from "./blockDefinition"
import { documentLines } from "./documentHtml"
import { officialDefinition, officialSections } from "./officialTemplate"
import { phpShape, type PhpRecord } from "./phpValues"
import { buildTable, designWithKeys } from "./repeatableTable"
import { defineTemplate } from "./templateDefinition"
import { DraftRequest, fieldDocument, prepareDraft, toRuntime } from "./templateDraft"
import type { SyllabusTemplate } from "./templatePresentation"
import { templateExport } from "./templateReads"
import { expandBlock, TemplateValidationError, type TemplateDefinition } from "./templateRuntime"
import { snapshotDefinition } from "../syllabus/snapshotDocuments"

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
  return payload.tablas as Record<string, PhpRecord>
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
    const list = (units.campos as PhpRecord).unidades as PhpRecord
    expect(list).toMatchObject({ titulo: "unidad", filas: "1-8", al_empezar: 4, error: "La planificación admite de 1 a 8 unidades." })
    const columns = list.columnas as PhpRecord
    expect(columns.nombre).toEqual({ titulo: "Nombre de la unidad", error: "El nombre de la unidad supera los 1000 caracteres." })
    expect(columns.resultado).toEqual({ tipo: "texto largo", titulo: "Resultados de aprendizaje", error: "El resultado de aprendizaje supera los 1000 caracteres." })
    const weeks = columns.semanas as PhpRecord
    expect(weeks).toMatchObject({ titulo: "semana", filas: "0-52", al_empezar: 4 })
    expect((weeks.columnas as PhpRecord).acd_h).toEqual({ tipo: "horas", titulo: "ACD", error: "Las horas por semana deben ser un número." })
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
      columnas: { autor: "autor", titulo: "titulo", anio: "anio", ciudad: "ciudad", editorial: "editorial", isbn: "isbn", codigo: "codigo" },
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
    const payload = { ...exported(withTable), tablas: asJson(fullBlocks(withTable)) }

    expect(imported(payload, withTable)).toEqual(withTable)
  })

  it("keeps a rule that differs from the catalog as a full object", () => {
    const official = officialDefinition()
    const units = official.blocks.unidades as PhpRecord
    const rules = structuredClone(units.rules) as PhpRecord[]
    rules[0] = { ...rules[0], message: "Hay más semanas que en el período." }
    const definition: TemplateDefinition = { ...official, blocks: { ...official.blocks, unidades: { ...units, rules } } }

    const reglas = blocksOf(exported(definition)).unidades.reglas as unknown[]

    expect(reglas[0]).toEqual({ code: "semanas_maximas", on: "save", message: "Hay más semanas que en el período.", checks: [{ count: "unidades.*.semanas", max: { variable: "semanas_periodo" } }] })
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

function legacyUnitsText(payload: unknown): string {
  return JSON.stringify(payload)
    .replace(/"value":\{"unidades":/g, '"value":{"units":')
    .replace(/"campos":\{"unidades":/g, '"campos":{"units":')
    .replace(/"(count|filled|sum)":"unidades/g, '"$1":"units')
    .replace(/"repeat":\{"value":"unidades"\}/g, '"repeat":{"value":"units"}')
    .replace(/\\"value\\":\\"unidades\\"/g, '\\"value\\":\\"units\\"')
}

function legacyUnits(payload: unknown): PhpRecord {
  return JSON.parse(legacyUnitsText(payload)) as PhpRecord
}

describe("template JSON in Spanish", () => {
  it("names the unidades list «unidades» in the export and in every rule and layout path", () => {
    const definition = officialDefinition()
    const text = JSON.stringify(blocksOf(exported(definition)).unidades)

    expect(Object.keys((definition.blocks.unidades as PhpRecord).value as PhpRecord)).toEqual(["unidades"])
    expect(Object.keys(blocksOf(exported(definition)).unidades.campos as PhpRecord)).toEqual(["unidades"])
    expect(text).not.toMatch(/\bunits\b/)
    expect(JSON.stringify(definition.blocks)).not.toMatch(/\bunits\b/)
    expect(text).toContain('\\"value\\":\\"unidades\\"')
  })

  it("imports a JSON that still names the unidades list «units», in short and in full form", () => {
    const definition = officialDefinition()
    const short = legacyUnits(exported(definition))
    const full = legacyUnits({ ...exported(definition), tablas: asJson(fullBlocks(definition)) })

    expect(legacyUnitsText(short)).toMatch(/"campos":\{"units":/)
    expect(legacyUnitsText(full)).toMatch(/"value":\{"units":/)
    expect(legacyUnitsText(full)).toMatch(/"count":"units\.\*\.semanas"/)
    expect(imported(short)).toEqual(definition)
    expect(imported(full)).toEqual(definition)
    const nodes = legacyUnits({ ...exported(definition), tablas: asJson(definition.blocks) })
    expect(legacyUnitsText(nodes)).toMatch(/"repeat":\{"value":"units"\}/)
    expect(imported(nodes)).toEqual(definition)
  })

  it("reads a unidades block value saved under «units» in a field of an older JSON as «unidades»", () => {
    const value = { unidades: [{ nombre: "Matrices", resultado: "Resuelve", semanas: [{ contenidos: "Tema", acd_h: "2" }] }] }
    const node = { type: "doc", content: [{ type: "documentBlock", attrs: { kind: "unidades", props: [], value } }] }
    const old = JSON.parse(JSON.stringify(node).replace('"value":{"unidades":', '"value":{"units":')) as PhpRecord
    const lines = JSON.parse(JSON.stringify(documentLines(node)).replace("&quot;unidades&quot;", "&quot;units&quot;")) as string[]
    const other = { type: "doc", content: [{ type: "documentBlock", attrs: { kind: "practicas", props: [], value: { units: [] } } }] }

    expect(JSON.stringify(lines)).toContain("units")
    expect(fieldDocument(old)).toEqual(node)
    expect(fieldDocument(lines)).toEqual(fieldDocument(documentLines(node)))
    expect(fieldDocument(other)).toEqual(other)
  })

  it("renders a revision snapshot saved with «units» through its own template definition", () => {
    const definition = legacyUnits(asJson(officialDefinition()))
    const value = { units: [{ nombre: "Matrices y determinantes", resultado: "Resuelve sistemas", semanas: [{ contenidos: "Operaciones con matrices", acd_h: "2" }] }] }
    const node = { type: "documentBlock", attrs: { kind: "unidades", props: [], value } }

    expect(JSON.stringify(definition.blocks)).toMatch(/"value":\{"units":/)
    const rendered = JSON.stringify(expandBlock(node, {}, snapshotDefinition({ template_definition: definition })))
    expect(rendered).toContain("Matrices y determinantes")
    expect(rendered).toContain("Operaciones con matrices")
  })

  it("writes the catalog columns with the Spanish names of the book data and reads them back to the Koha names", () => {
    const definition = officialDefinition()
    const payload = exported(definition)
    const english = structuredClone(payload)
    ;(blocksOf(english).bibliografia.catalogo as PhpRecord).columnas = { author: "autor", title: "titulo", year: "anio", place: "ciudad", publisher: "editorial", isbn: "isbn", format: "codigo" }
    const twice = structuredClone(payload)
    ;(blocksOf(twice).bibliografia.catalogo as PhpRecord).columnas = { autor: "autor", author: "titulo" }
    const unknown = structuredClone(payload)
    ;(blocksOf(unknown).bibliografia.catalogo as PhpRecord).columnas = { editor: "autor" }

    expect(blocksOf(payload).bibliografia.catalogo).toEqual({
      lista: "libros",
      columnas: { autor: "autor", titulo: "titulo", anio: "anio", ciudad: "ciudad", editorial: "editorial", isbn: "isbn", codigo: "codigo" },
    })
    expect((imported(payload).blocks.bibliografia as PhpRecord).catalog).toEqual((definition.blocks.bibliografia as PhpRecord).catalog)
    expect(((definition.blocks.bibliografia as PhpRecord).catalog as PhpRecord).map).toEqual({ author: "autor", title: "titulo", year: "anio", place: "ciudad", publisher: "editorial", isbn: "isbn", format: "codigo" })
    expect(imported(english)).toEqual(definition)
    const shelf = structuredClone(payload)
    ;(blocksOf(shelf).bibliografia.catalogo as PhpRecord).columnas = { autor: "autor", signatura: "codigo" }
    expect(((imported(shelf).blocks.bibliografia as PhpRecord).catalog as PhpRecord).map).toEqual({ author: "autor", call_number: "codigo" })
    expect(definitionErrors(() => imported(twice))).toEqual(["blocks.bibliografia.catalogo.columnas: «autor» y «author» son el mismo dato del libro."])
    expect(definitionErrors(() => imported(unknown))).toEqual([
      "blocks.bibliografia.catalogo.columnas: «editor» no es un dato del libro (autor, titulo, anio, ciudad, editorial, isbn, codigo o signatura).",
    ])
  })

  it("writes «horas» for the hour columns and still reads «número»", () => {
    const definition = officialDefinition()
    const payload = exported(definition)
    const weeks = (((blocksOf(payload).unidades.campos as PhpRecord).unidades as PhpRecord).columnas as PhpRecord).semanas as PhpRecord
    const columns = weeks.columnas as PhpRecord
    const number = JSON.parse(JSON.stringify(payload).replaceAll('"tipo":"horas"', '"tipo":"número"')) as PhpRecord

    for (const key of ["acd_h", "ape_h", "aa_h"]) expect(columns[key]).toMatchObject({ tipo: "horas" })
    expect(JSON.stringify(payload)).not.toContain('"tipo":"número"')
    expect(JSON.stringify(number)).toContain('"tipo":"número"')
    expect(imported(number)).toEqual(definition)
    expect(imported(payload)).toEqual(definition)
  })
})

describe("template styles live in document", () => {
  const REDUNDANT = 'style="background:#C3D4EA;font-weight:bold"'

  it("exports the official table headers without repeating the document header background and bold", () => {
    const text = JSON.stringify(exported())

    expect(text).not.toContain(REDUNDANT.replaceAll('"', '\\"'))
    expect(text).toContain("<th>Autor</th>")
    expect(text.match(/<th[^>]*style=\\"background:#C3D4EA;text-align:(center|right)\\"/g)).toHaveLength(22)
    expect(text).toContain('style=\\"background:#4F81BD;color:#FFFFFF;font-weight:bold\\"')
  })

  it("imports an older JSON whose headers still repeat the document style and keeps that style", () => {
    const definition = officialDefinition()
    const payload = exported(definition)
    const older = JSON.parse(JSON.stringify(payload).replaceAll("<th>Autor</th>", `<th ${REDUNDANT.replaceAll('"', '\\"')}>Autor</th>`)) as PhpRecord
    const header = (JSON.stringify(imported(older)).match(/\{"type":"tableHeader","attrs":\{[^}]*\},"content":\[\{"type":"paragraph"[^\]]*"text":"Autor"/) ?? [""])[0]

    expect(JSON.stringify(older)).toContain(REDUNDANT.replaceAll('"', '\\"'))
    expect(header).toContain('"backgroundColor":"#C3D4EA"')
    expect(header).toContain('"bold":true')
    expect(imported(payload)).toEqual(definition)
  })
})

describe("the whole template JSON in Spanish", () => {
  const ROOT = ["$schema", "politica_respuestas", "documento", "variables", "tablas", "secciones_obligatorias", "secciones_biblioteca", "campos_docente", "contenidos_predefinidos", "secciones"]

  it("writes every key and enumerated value in Spanish, as in the agreed example", () => {
    const payload = exported()

    expect(Object.keys(payload)).toEqual(ROOT)
    expect(payload).not.toHaveProperty("versión")
    expect(payload).not.toHaveProperty("version")
    expect(payload.politica_respuestas).toBe("protegida")
    expect(payload.documento).toEqual({
      papel: "carta",
      orientacion: "vertical",
      margen_cm: 1.5,
      letra: "Arial",
      interlineado: 1.15,
      espacio_parrafos_pt: 6,
      tamaños: { titulo: 14, seccion: 11, texto: 11 },
      colores: { texto: "#000000", titulo: "#2F5496", fondo_encabezado_tabla: "#C3D4EA", texto_encabezado_tabla: "#000000", borde_tabla: "#333333", texto_vacio: "#595959" },
      titulo: { texto: "PROGRAMA DE ASIGNATURA (SÍLABO)", negrita: true, cursiva: false, alineacion: "centro" },
      titulo_seccion: { negrita: true, cursiva: false, alineacion: "izquierda" },
      texto: { alineacion: "izquierda" },
      encabezado: { logos: [{ fuente: "institucion", alto_pt: 36 }, { fuente: "facultad", alto_pt: 36 }], proporcion_izquierda: 0.638 },
      texto_vacio: "Sin contenido",
      opciones: { margen_cm: [1.5, 2, 2.5, 3], titulo: [10, 14, 16, 18], seccion: [10, 11, 12, 14], texto: [10, 11, 12] },
    })
    const variables = payload.variables as Record<string, PhpRecord>
    expect(variables.nombre_facultad).toEqual({ etiqueta: "Nombre de la facultad", fuente: "identificacion.facultad", ejemplo: "Ciencias Administrativas, Gestión Empresarial e Informática" })
    expect(Object.values(variables).find((variable) => variable.fuente === "identificacion.horas_acd")).toMatchObject({ formato: "numero" })
    expect(Object.values(variables).find((variable) => variable.igual_a === "Unidad profesional")).toMatchObject({ fuente: "identificacion.unidad_organizacion" })
    expect((payload.contenidos_predefinidos as PhpRecord[])[0]).toEqual({ clave: "identificacion", etiqueta: "Identificación institucional", campo: "asignatura" })
    const section = (payload.secciones as PhpRecord[])[0]
    expect(Object.keys(section)).toEqual(["clave", "titulo", "orientacion", "campos"])
    expect(section).toMatchObject({ clave: "identificacion", orientacion: "vertical" })
    const field = (section.campos as PhpRecord[])[0]
    expect(Object.keys(field)).toEqual(["clave", "etiqueta", "quien_llena", "contenido"])
    expect(blocksOf(payload)).toEqual(blocksOf(exported()))
    const outsideBlocks = JSON.stringify({ ...payload, tablas: null, secciones: (payload.secciones as PhpRecord[]).map((item) => ({ ...item, campos: (item.campos as PhpRecord[]).map((one) => ({ ...one, contenido: null })) })) })
    for (const english of ['"document"', '"sections"', '"fields"', '"label"', '"source"', '"sample"', '"paper"', '"letter"', '"portrait"', '"center"', '"left"', '"key"', '"title"', '"content"', '"identification.']) {
      expect(outsideBlocks).not.toContain(english)
    }
  })

  it("writes the field condition and character limit in Spanish and reads the limit back", () => {
    const official = officialDefinition()
    const definition = { ...official, field_conditions: { descripcion: { response: "modalidad", options: ["virtual"] } }, field_limits: { descripcion: 900 } } as TemplateDefinition
    const fieldsOf = (payload: PhpRecord) => (payload.secciones as PhpRecord[]).flatMap((section) => section.campos as PhpRecord[])

    expect(fieldsOf(exported(definition)).find((item) => item.clave === "descripcion")).toMatchObject({ mostrar_si: { respuesta: "modalidad", opciones: ["virtual"] }, max_caracteres: 900 })
    const payload = exported(official)
    const objective = fieldsOf(payload).find((item) => item.clave === "objetivo_general") as PhpRecord
    objective.max_caracteres = 700
    expect(imported(payload).field_limits).toEqual({ objetivo_general: 700 })
  })

  it("imports its own export back to the identical definition, with and without an admin-designed table", () => {
    const official = officialDefinition()
    const definition: TemplateDefinition = { ...official, blocks: { ...official.blocks, practicas: practicesBlock(Object.keys(official.variables)) } }

    expect(imported(exported(official))).toEqual(official)
    expect(imported(exported(definition), definition)).toEqual(definition)
  })

  it("accepts Spanish and English keys and values in any mix", () => {
    const definition = officialDefinition()
    const payload = exported(definition)
    const documento = payload.documento as PhpRecord
    const mixed: PhpRecord = {
      ...payload,
      documento: { ...documento, papel: "letter", orientation: "vertical", titulo: { ...(documento.titulo as PhpRecord), alignment: "centro" } },
      sections: (payload.secciones as PhpRecord[]).map((section, index) => (index === 0 ? { key: section.clave, title: section.titulo, orientation: "portrait", fields: section.campos } : section)),
    }
    delete mixed.secciones
    delete mixed["versión"]
    mixed.version = 2

    expect(imported(mixed)).toEqual(definition)
  })
})
