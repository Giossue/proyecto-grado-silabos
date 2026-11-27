// @vitest-environment node
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { defineBlock } from "./blockDefinition"
import { officialDefinition, officialSections } from "./officialTemplate"
import { phpShape, record, type PhpRecord } from "./phpValues"
import { blockDesigns, buildTable, designWithKeys, drawnLayout, readTable } from "./repeatableTable"
import { defineTemplate, withBlocks, withListLimits } from "./templateDefinition"
import { DraftRequest, exportedBlock, prepareDraft, toRuntime } from "./templateDraft"
import type { SyllabusTemplate } from "./templatePresentation"
import { templateExport } from "./templateReads"
import { initialValue, normalizeBlock, TemplateValidationError, type TemplateDefinition } from "./templateRuntime"
import { shortBlock } from "./templateShortForm"

const column = (key: string) => ({ key, title: key })

const source = (extra: PhpRecord = {}): PhpRecord => ({
  titulo: "Origen",
  campos: { temas: { titulo: "tema", filas: "1-8", columnas: { resultado: { titulo: "Resultado" }, horas: "horas" }, ...extra } },
  "diseño": drawnLayout("temas", [column("resultado"), column("horas")]),
})

const target = (list: PhpRecord = {}, columns: PhpRecord = {}): PhpRecord => ({
  titulo: "Destino",
  campos: {
    aportes: {
      titulo: "aporte",
      filas_desde: "origen.temas",
      columnas: {
        resultado: { titulo: "Resultado", desde: "resultado" },
        nivel: { titulo: "Nivel", opciones: { alto: "Alto", bajo: "Bajo" } },
        ...columns,
      },
      ...list,
    },
  },
  "diseño": drawnLayout("aportes", [column("resultado"), column("nivel")]),
})

const define = (blocks: PhpRecord): TemplateDefinition => defineTemplate({ blocks, variables: officialDefinition().variables })

const errorsOf = (work: () => unknown): string[] => {
  try {
    work()
  } catch (error) {
    if (error instanceof TemplateValidationError) return Object.values(error.errors).flat()
    throw error
  }
  return []
}

const listOf = (definition: TemplateDefinition, kind: string, key: string): PhpRecord => record(record(record(definition.blocks[kind]).value)[key])
const columnsOf = (definition: TemplateDefinition, kind: string, key: string): PhpRecord => record(record(listOf(definition, kind, key).items).properties)
const rowsOf = (definition: TemplateDefinition, kind: string, value: unknown): PhpRecord[] =>
  record(normalizeBlock(kind, record(definition.blocks[kind]), { props: {}, value }).value)[kind === "origen" ? "temas" : "aportes"] as PhpRecord[]

describe("filas heredadas en la definición", () => {
  it("guarda la referencia de la lista y la columna copiada y marca solo la lista de origen", () => {
    const definition = define({ destino: target(), origen: source() })
    expect(listOf(definition, "destino", "aportes").rows_from).toBe("origen.temas")
    expect(record(columnsOf(definition, "destino", "aportes").resultado).copy_of).toBe("resultado")
    expect(listOf(definition, "origen", "temas").row_ids).toBe(true)
    expect(listOf(definition, "destino", "aportes")).not.toHaveProperty("row_ids")
  })

  it("no cambia las listas que nadie usa como origen", () => {
    const alone = define({ origen: source() })
    expect(listOf(alone, "origen", "temas")).not.toHaveProperty("row_ids")
    expect(alone.blocks.origen).toEqual(defineTemplate({ blocks: { origen: source() } }).blocks.origen)
    expect(rowsOf(alone, "origen", { temas: [{ _id: "abc", resultado: "A" }] })).toEqual([{ resultado: "A", horas: "" }])
  })

  it("quita la marca cuando ya nadie usa la lista y la forma completa no puede imponerla", () => {
    const linked = define({ origen: source(), destino: target() })
    const free = withListLimits({ ...linked, blocks: { origen: linked.blocks.origen } }, [{ block: "origen", path: "temas", min: 1, max: 8, initial: 1 }])
    expect(listOf(free, "origen", "temas")).not.toHaveProperty("row_ids")
    const forced = { ...listOf(define({ origen: source() }), "origen", "temas"), row_ids: true }
    const block = defineBlock("origen", { label: "Origen", value: { temas: forced }, layout: drawnLayout("temas", [column("resultado")]) }, [])
    expect(record(record(block.value).temas)).not.toHaveProperty("row_ids")
  })

  it.each([
    ["la tabla de origen no existe", { destino: target() }, "blocks.destino.campos.aportes.filas_desde: la tabla «origen» no existe en la plantilla."],
    ["la lista de origen no existe", { origen: source(), destino: target({ filas_desde: "origen.otra" }) }, "blocks.destino.campos.aportes.filas_desde: la tabla «origen» no tiene una lista de filas «otra»."],
    ["la forma está mal escrita", { origen: source(), destino: target({ filas_desde: "origen" }) }, "blocks.destino.campos.aportes.filas_desde: escriba la tabla y su lista como «tabla.lista»."],
    ["toma las filas de sí misma", { origen: source(), destino: target({ filas_desde: "destino.aportes" }) }, "blocks.destino.campos.aportes.filas_desde: una lista no puede tomar filas de su propia tabla."],
    ["la columna de origen no existe", { origen: source(), destino: target({}, { otra: { desde: "nada" } }) }, "blocks.destino.campos.aportes.columnas.otra.desde: la lista «origen.temas» no tiene una columna de un solo dato «nada»."],
    ["pide filas mínimas", { origen: source(), destino: target({ filas: "1-8" }) }, "blocks.destino.campos.aportes.filas: una lista con «filas_desde» no pide filas propias: use un mínimo de 0 y no ponga «al_empezar» mayor que 0."],
    ["pide filas al empezar", { origen: source(), destino: target({ filas: "0-8", al_empezar: 2 }) }, "blocks.destino.campos.aportes.al_empezar: una lista con «filas_desde» no pide filas propias: use un mínimo de 0 y no ponga «al_empezar» mayor que 0."],
  ])("rechaza si %s", (_, blocks, message) => {
    expect(errorsOf(() => define(blocks))).toEqual([message])
  })

  it("rechaza cadenas y ciclos", () => {
    const back = { ...source({ filas_desde: "destino.aportes", filas: "0-8" }) }
    expect(errorsOf(() => define({ origen: back, destino: target() }))[0]).toMatch(/filas_desde: la lista «(destino\.aportes|origen\.temas)» ya toma sus filas de otra tabla\./)
    const third = { ...target({ filas_desde: "destino.aportes" }), titulo: "Tercera" }
    expect(errorsOf(() => define({ origen: source(), destino: target(), tercera: third }))).toEqual([
      "blocks.tercera.campos.aportes.filas_desde: la lista «destino.aportes» ya toma sus filas de otra tabla.",
    ])
  })

  it("rechaza copiar una lista anidada y «desde» fuera de una lista heredada", () => {
    const nested = source()
    record(record(record(nested.campos).temas).columnas).semanas = { filas: "0-3", columnas: { tema: "texto" } }
    expect(errorsOf(() => define({ origen: nested, destino: target({}, { otra: { desde: "semanas" } }) }))).toEqual([
      "blocks.destino.campos.aportes.columnas.otra.desde: la lista «origen.temas» no tiene una columna de un solo dato «semanas».",
    ])
    const loose = source()
    record(record(record(loose.campos).temas).columnas).resultado = { desde: "resultado" }
    expect(errorsOf(() => define({ origen: loose }))).toEqual(["blocks.origen.campos.temas.columnas.resultado.desde: solo se usa en una columna de una lista con «filas_desde»."])
    expect(errorsOf(() => define({ origen: source(), destino: target({}, { grupo: { campos: { uno: { desde: "resultado" } } } }) }))).toEqual([
      "blocks.destino.campos.aportes.columnas.grupo.campos.uno.desde: solo se usa en una columna de una lista con «filas_desde».",
    ])
    expect(errorsOf(() => define({ origen: source(), destino: target({}, { grupo: { desde: "resultado", campos: { uno: "texto" } } }) }))).toEqual([
      "blocks.destino.campos.aportes.columnas.grupo.desde: solo va en una columna de un solo dato.",
    ])
  })

  it("solo hereda una lista principal de la tabla y sin catálogo de la biblioteca", () => {
    const inner = target({}, { sub: { filas_desde: "origen.temas", columnas: { uno: "texto" } } })
    expect(errorsOf(() => define({ origen: source(), destino: inner }))).toEqual([
      "blocks.destino.campos.aportes.columnas.sub.filas_desde: solo la usa una lista principal de la tabla, con columnas.",
    ])
    const catalog: PhpRecord = { ...target(), catalogo: { lista: "aportes", columnas: { titulo: "otra" } } }
    record(record(record(catalog.campos).aportes).columnas).otra = "texto"
    expect(errorsOf(() => define({ origen: source(), destino: catalog }))).toEqual(["blocks.destino.catalogo.lista: una lista con «filas_desde» no admite libros del catálogo."])
  })

  it("no admite «desde» en las propiedades", () => {
    const block = { ...source(), propiedades: { nota: { desde: "resultado" } } }
    expect(errorsOf(() => define({ origen: block }))).toEqual(["blocks.origen.propiedades.nota: las propiedades no admiten «desde»."])
  })

  it("vuelve a validar al cambiar tablas o límites", () => {
    const linked = define({ origen: source(), destino: target() })
    expect(errorsOf(() => withListLimits(linked, [{ block: "destino", path: "aportes", min: 1, max: 8, initial: 1 }]))[0]).toContain("no pide filas propias")
    const kept = withListLimits(linked, [{ block: "origen", path: "temas", min: 1, max: 6, initial: 2 }])
    expect(listOf(kept, "origen", "temas")).toMatchObject({ maxItems: 6, initial: 2, row_ids: true })
    expect(withBlocks(linked, { origen: linked.blocks.origen }).blocks.origen).toEqual(linked.blocks.origen)
  })
})

describe("identificadores de fila del origen", () => {
  const definition = define({ origen: source(), destino: target() })

  it("conserva los válidos y asigna los que faltan o se repiten, siempre igual", () => {
    const value = { temas: [{ resultado: "A" }, { _id: "r1", resultado: "B" }, { _id: "r1", resultado: "C" }, { _id: "mal id", resultado: "D" }, { _id: 7, resultado: "E" }] }
    const rows = rowsOf(definition, "origen", value)
    expect(rows.map((row) => row._id)).toEqual(["r2", "r1", "r3", "r4", "r5"])
    expect(Object.keys(rows[0])).toEqual(["_id", "resultado", "horas"])
    expect(rowsOf(definition, "origen", structuredClone(value))).toEqual(rows)
    expect(rowsOf(definition, "origen", { temas: rows })).toEqual(rows)
  })

  it("no mueve el identificador al reordenar, corregir o borrar filas", () => {
    const rows = rowsOf(definition, "origen", { temas: [{ _id: "aa11", resultado: "A" }, { _id: "bb22", resultado: "B" }] })
    expect(rowsOf(definition, "origen", { temas: [{ ...rows[1], resultado: "B corregida" }, rows[0]] }).map((row) => row._id)).toEqual(["bb22", "aa11"])
    expect(rowsOf(definition, "origen", { temas: [rows[1]] }).map((row) => row._id)).toEqual(["bb22"])
  })

  it("da el mismo valor inicial cada vez", () => {
    const fields = record(definition.blocks.origen).value
    expect(initialValue(fields, {})).toEqual({ temas: [{ _id: "r1", resultado: "", horas: "" }] })
    expect(initialValue(fields, {})).toEqual(initialValue(fields, {}))
    expect(rowsOf(definition, "origen", {})).toEqual([{ _id: "r1", resultado: "", horas: "" }])
  })

  it("no agrega identificadores ni filas a la lista heredada", () => {
    expect(rowsOf(definition, "destino", {})).toEqual([])
    expect(rowsOf(definition, "destino", { aportes: [{ _id: "r1", resultado: "A", nivel: "alto" }] })).toEqual([{ resultado: "A", nivel: "alto" }])
  })
})

describe("JSON de la plantilla con filas heredadas", () => {
  const variables: string[] = []

  it("exporta en forma corta y se importa igual", () => {
    const definition = define({ origen: source(), destino: target() })
    for (const kind of ["origen", "destino"]) {
      const block = record(definition.blocks[kind])
      const short = JSON.parse(JSON.stringify(phpShape(shortBlock(block))))
      expect(exportedBlock(kind, block, variables)).toEqual(shortBlock(block))
      expect(JSON.stringify(short)).not.toMatch(/row_ids|rows_from|copy_of|_id|"type"/)
      expect(define({ origen: source(), destino: target(), [kind]: toRuntime(structuredClone(short)) }).blocks[kind]).toEqual(block)
    }
    const aportes = record(record(shortBlock(record(definition.blocks.destino)).campos).aportes)
    expect(aportes.filas_desde).toBe("origen.temas")
    expect(record(aportes.columnas).resultado).toEqual({ titulo: "Resultado", desde: "resultado" })
  })

  it("no escribe la marca calculada aunque la lista de origen no tenga forma corta", () => {
    const items = { type: "object", title: "fila", properties: { resultado: { type: "string", multiline: true } } }
    const full = defineBlock("origen", { label: "Origen", value: { temas: { type: "array", items } }, layout: drawnLayout("temas", [column("resultado")]) }, [])
    const definition = define({ origen: source(), destino: target() })
    const linked = { ...full, value: { temas: { ...record(record(full.value).temas), row_ids: true } } }
    expect(listOf(definition, "origen", "temas").row_ids).toBe(true)
    expect(JSON.stringify(shortBlock(linked))).not.toContain("row_ids")
  })

  it("recorre la exportación e importación de la plantilla completa con las unidades como origen", () => {
    const official = officialDefinition()
    const contribution = {
      titulo: "Contribución",
      campos: { aportes: { filas_desde: "unidades.unidades", columnas: { resultado: { desde: "resultado" } } } },
      "diseño": drawnLayout("aportes", [column("resultado")]),
    }
    const current = define({ unidades: official.blocks.unidades, aporte: contribution })
    const linked = { ...official, blocks: { ...official.blocks, unidades: current.blocks.unidades, aporte: current.blocks.aporte } }
    const template: SyllabusTemplate = {
      id: "01a1c5ba-10b4-7129-925f-6f0b8c3d2e11",
      modifiedAt: null,
      definition: linked,
      sections: officialSections().map((section, s) => ({
        id: `section-${s}`, key: section.key, title: section.title, orientation: section.orientation, position: s + 1,
        blocks: section.fields.map((field, f) => ({
          id: `block-${s}-${f}`, key: field.key, title: field.label ?? field.key, position: f + 1,
          fields: [{ id: `field-${s}-${f}`, blockId: `block-${s}-${f}`, key: field.key, label: field.label ?? field.key, responsible: field.responsible, content: field.content }],
        })),
      })),
    }
    const payload = JSON.parse(JSON.stringify(phpShape(templateExport(new Request("https://silabos.ueb.edu.ec/"), template, linked)))) as PhpRecord
    expect(record(record(record(record(payload.tablas).aporte).campos).aportes).filas_desde).toBe("unidades.unidades")
    const imported = new DraftRequest(prepareDraft(toRuntime(payload) as PhpRecord), official).definition()
    expect(imported.blocks.aporte).toEqual(linked.blocks.aporte)
    expect(imported.blocks.unidades).toEqual(linked.blocks.unidades)
    expect(listOf(imported, "unidades", "unidades").row_ids).toBe(true)
  })

  it("el esquema publicado describe las dos claves", () => {
    const schema = JSON.parse(readFileSync(path.join(process.cwd(), "src", "server", "configuration", "plantilla.schema.json"), "utf8"))
    const defs = schema.$defs
    expect(defs.shortList.properties.filas_desde.type).toBe("string")
    expect(defs.shortLeaf.properties.desde.$ref).toBe("#/$defs/key")
    expect(defs.shortChoice.properties.desde.$ref).toBe("#/$defs/key")
    expect(defs.array.properties.rows_from.type).toBe("string")
    for (const name of ["text", "choice", "number"]) expect(defs[name].properties.copy_of.$ref).toBe("#/$defs/key")
  })
})

describe("diseñador de tablas", () => {
  const reason = "La tabla toma sus filas de otra tabla («filas_desde») y este editor todavía no puede cambiar esa relación. Para cambiarla use Más → Editar JSON."

  it("bloquea la tabla heredada con el motivo y no deja reemplazarla", () => {
    const definition = define({ origen: source(), destino: target() })
    expect(blockDesigns(definition).destino).toEqual({ design: null, reason })
    const plain = defineBlock("destino", { label: "Destino", value: { aportes: { type: "array", items: { type: "object", properties: { nivel: { type: "string" } } } } }, layout: drawnLayout("aportes", [column("nivel")]) }, [])
    expect(errorsOf(() => withBlocks(definition, { destino: plain }))[0]).toContain("no se puede cambiar desde el editor")
  })

  it("la tabla de origen sigue editable y conserva sus identificadores al guardarla", () => {
    const design = designWithKeys({ label: "Prácticas", item: "práctica", min: 1, max: 5, initial: 1, columns: [{ title: "Tema", type: "text", max_length: 1000, multiline: false, width: null, required: false }] })
    const kind = String(design.kind)
    const block = defineBlock(kind, buildTable(design), [])
    const child = { titulo: "Hija", campos: { aportes: { filas_desde: `${kind}.filas`, columnas: { tema: { desde: "tema" } } } }, "diseño": drawnLayout("aportes", [column("tema")]) }
    const definition = define({ [kind]: block, hija: child })
    expect(listOf(definition, kind, "filas").row_ids).toBe(true)
    expect(readTable(kind, record(definition.blocks[kind]), []).design).not.toBeNull()
    expect(withBlocks(definition, { [kind]: defineBlock(kind, buildTable({ ...design, max: 9 }), []) }).blocks[kind]).toMatchObject({ value: { filas: { maxItems: 9, row_ids: true } } })
  })

  it("al renombrar la lista de origen desde el editor se rechaza la relación rota", () => {
    const design = designWithKeys({ label: "Prácticas", item: "práctica", min: 1, max: 5, initial: 1, columns: [{ title: "Tema", type: "text", max_length: 1000, multiline: false, width: null, required: false }] })
    const kind = String(design.kind)
    const child = { titulo: "Hija", campos: { aportes: { filas_desde: `${kind}.filas`, columnas: { tema: { desde: "tema" } } } }, "diseño": drawnLayout("aportes", [column("tema")]) }
    const definition = define({ [kind]: defineBlock(kind, buildTable(design), []), hija: child })
    expect(errorsOf(() => withBlocks(definition, { [kind]: defineBlock(kind, buildTable({ ...design, list: "otras" }), []) }))).toEqual([
      `blocks.hija.campos.aportes.filas_desde: la tabla «${kind}» no tiene una lista de filas «filas».`,
    ])
  })
})
