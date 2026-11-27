// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import { canonicalJson } from "../documents/canonicalJson"
import { defineBlock } from "../configuration/blockDefinition"
import { documentLines } from "../configuration/documentHtml"
import { draftProblems, toRuntime } from "../configuration/templateDraft"
import { record, type PhpRecord } from "../configuration/phpValues"
import { templateSystemPrompt } from "./knowledge"
import { AssistantDraft } from "./assistantDraft"
import { draftValidator } from "./templateAssistant"
import { TemplateTools } from "./templateTools"
import { officialTemplate } from "./testing"
import type { SyllabusTemplate } from "../configuration/templatePresentation"

const KIND = "tabla_practicas_de_laboratorio"

const REQUIRED_RULE = {
  code: "tema_obligatoria",
  on: "submit",
  message: "Llene «Tema» en cada práctica: {detail}.",
  checks: [{ label: "Tema", filled: "filas.*.tema", equals: { count: "filas" } }],
}

const SHORT_TABLE = {
  titulo: "Prácticas de laboratorio",
  campos: {
    filas: {
      titulo: "práctica",
      filas: "1-10",
      al_empezar: 2,
      columnas: {
        tema: { titulo: "Tema" },
        modalidad: { titulo: "Modalidad", opciones: { presencial: "Presencial", virtual: "Virtual" } },
        horas: { tipo: "horas", titulo: "Horas" },
      },
    },
  },
  reglas: [REQUIRED_RULE],
}

let template: SyllabusTemplate

beforeEach(() => {
  template = officialTemplate()
})

function toolsFor(draft: AssistantDraft): TemplateTools {
  return new TemplateTools(draft, draftValidator, { estado: "ninguna", aviso: "" })
}

async function use(tools: TemplateTools, name: string, args: PhpRecord): Promise<{ failed: boolean; data: PhpRecord }> {
  const result = await tools.execute({ id: "c1", name, arguments: args, rawArguments: JSON.stringify(args) })
  return { failed: result.failed, data: JSON.parse(result.content) as PhpRecord }
}

function designed(draft: AssistantDraft): Promise<{ failed: boolean; data: PhpRecord }> {
  const column = (nombre: string, tipo: string, obligatoria = false, opciones: string[] = []) => ({ nombre, tipo, obligatoria, opciones })
  return use(toolsFor(draft), "crear_tabla_repetible", {
    titulo: "Prácticas de laboratorio",
    fila: "práctica",
    minimo: 1,
    maximo: 10,
    al_empezar: 2,
    columnas: [column("Tema", "texto", true), column("Modalidad", "opcion", false, ["Presencial", "Virtual"]), column("Horas", "numero")],
  })
}

function storedTable(draft: AssistantDraft, kind = KIND): string {
  return canonicalJson(record(draft.payload().block_changes)[kind])
}

describe("template assistant tables in the short form", () => {
  it("stores a short-form table exactly like the equivalent long form and the designer table", async () => {
    const byDesigner = AssistantDraft.fromTemplate(template)
    expect((await designed(byDesigner)).data.clave).toBe(KIND)
    const block = record(record(byDesigner.payload().block_changes)[KIND])
    const longForm = { label: block.label, value: block.value, rules: block.rules, layout: documentLines({ type: "doc", content: block.layout }) }

    const byShort = AssistantDraft.fromTemplate(template)
    const short = await use(toolsFor(byShort), "escribir_tabla", { clave: KIND, tabla: JSON.stringify(SHORT_TABLE) })
    const byLong = AssistantDraft.fromTemplate(template)
    const long = await use(toolsFor(byLong), "escribir_tabla", { clave: KIND, tabla: JSON.stringify(longForm) })

    expect(short).toEqual({ failed: false, data: { ok: true, mensaje: 'Tabla nueva lista. Póngala en un campo con <div data-block="CLAVE"></div>.', clave: KIND } })
    expect(long.failed).toBe(false)
    expect(storedTable(byShort)).toBe(storedTable(byDesigner))
    expect(storedTable(byLong)).toBe(storedTable(byDesigner))
    expect(byShort.changes()).toContain("Nueva tabla repetible «Prácticas de laboratorio».")
    expect(await draftValidator.errors(byShort)).toEqual([])
  })

  it("accepts the short form as an object as well as JSON text", async () => {
    const draft = AssistantDraft.fromTemplate(template)
    const byDesigner = AssistantDraft.fromTemplate(template)
    await designed(byDesigner)

    expect((await use(toolsFor(draft), "escribir_tabla", { clave: KIND, tabla: SHORT_TABLE as unknown as PhpRecord })).failed).toBe(false)
    expect(storedTable(draft)).toBe(storedTable(byDesigner))
  })

  it("gives the AI a clear Spanish error for an unknown rule name, a bad column type or bad JSON", async () => {
    const tools = toolsFor(AssistantDraft.fromTemplate(template))
    const withRule = { ...SHORT_TABLE, reglas: ["reglas_inventadas"] }
    const withType = { ...SHORT_TABLE, campos: { filas: { ...SHORT_TABLE.campos.filas, columnas: { tema: { titulo: "Tema", tipo: "fecha" } } } } }

    const rule = await use(tools, "escribir_tabla", { clave: KIND, tabla: JSON.stringify(withRule) })
    const type = await use(tools, "escribir_tabla", { clave: KIND, tabla: JSON.stringify(withType) })
    const json = await use(tools, "escribir_tabla", { clave: KIND, tabla: "{titulo:" })

    expect(rule.failed).toBe(true)
    expect(rule.data.error).toBe(
      `La tabla no es válida: blocks.${KIND}.reglas.0: «reglas_inventadas» no es una regla conocida. Use semanas_maximas, unidades_sin_nombre, unidades_sin_semanas, semanas_unidades_incompletas, horas_unidades_no_coinciden o libros_sin_titulo, o escriba la regla completa.`,
    )
    expect(type.failed).toBe(true)
    expect(type.data.error).toBe(`La tabla no es válida: blocks.${KIND}.campos.filas.columnas.tema.tipo: use «texto», «texto largo», «número», «horas» o «sí/no».`)
    expect(json).toEqual({ failed: true, data: { error: "«tabla» no es un JSON válido: escriba la tabla en forma corta como un objeto JSON." } })
  })

  it("asks for the column titles when the system draws the table", async () => {
    const tools = toolsFor(AssistantDraft.fromTemplate(template))
    const untitled = { ...SHORT_TABLE, campos: { filas: { ...SHORT_TABLE.campos.filas, columnas: { ...SHORT_TABLE.campos.filas.columnas, tema: "texto" } } } }

    const result = await use(tools, "escribir_tabla", { clave: KIND, tabla: JSON.stringify(untitled) })

    expect(result).toEqual({ failed: true, data: { error: `La tabla no es válida: blocks.${KIND}.campos.filas.columnas.tema.titulo: escriba el título de la columna; sin «diseño» el sistema dibuja la tabla con esos títulos.` } })
  })

  it("shows the AI the tables in the short form, with rules by name and the drawn layout implied", async () => {
    const draft = AssistantDraft.fromTemplate(template)
    const tools = toolsFor(draft)
    await designed(draft)

    const shown = await use(tools, "ver_tabla", { clave: KIND })
    const library = await use(tools, "ver_tabla", { clave: "bibliografia" })
    const missing = await use(tools, "ver_tabla", { clave: "no_existe" })

    expect(shown).toEqual({ failed: false, data: { clave: KIND, se_puede_cambiar: true, tabla: SHORT_TABLE } })
    const books = record(library.data.tabla)
    expect(library.data.se_puede_cambiar).toBe(true)
    expect(Object.keys(books)).toEqual(["titulo", "campos", "reglas", "catalogo"])
    expect(books.reglas).toEqual(["libros_sin_titulo"])
    expect(JSON.stringify(books)).not.toContain('"type"')
    expect(missing).toEqual({ failed: true, data: { error: "No existe la tabla «no_existe». Las claves de las tablas aparecen en ver_plantilla." } })
  })

  it("names each table key in ver_plantilla so the AI can open it", async () => {
    const overview = await use(toolsFor(AssistantDraft.fromTemplate(template)), "ver_plantilla", {})

    expect(JSON.stringify(overview.data)).toContain("[tabla «Bibliografía», clave bibliografia]")
  })

  it("changes an existing designer table from its short form and reports it as a change", async () => {
    const draft = AssistantDraft.fromTemplate(template)
    const tools = toolsFor(draft)
    await designed(draft)
    const shown = record((await use(tools, "ver_tabla", { clave: KIND })).data.tabla)
    const filas = record(record(shown.campos).filas)
    const changed = { ...shown, campos: { filas: { ...filas, columnas: { ...record(filas.columnas), lugar: { titulo: "Lugar" } } } } }

    const result = await use(tools, "escribir_tabla", { clave: KIND, tabla: JSON.stringify(changed) })

    expect(result.failed).toBe(false)
    expect((await use(tools, "ver_tabla", { clave: KIND })).data.tabla).toEqual(changed)
    expect(await draftValidator.errors(draft)).toEqual([])
  })

  it("shows the units block with its rules by name and refuses to change it, before saving", async () => {
    const draft = AssistantDraft.fromTemplate(template)
    const tools = toolsFor(draft)
    const shown = await use(tools, "ver_tabla", { clave: "unidades" })
    const units = record(shown.data.tabla)

    const result = await use(tools, "escribir_tabla", { clave: "unidades", tabla: JSON.stringify({ ...units, titulo: "Unidades" }) })

    expect(shown.data.se_puede_cambiar).toBe(false)
    expect(units.reglas).toEqual(["semanas_maximas", "unidades_sin_nombre", "unidades_sin_semanas", "semanas_unidades_incompletas", "horas_unidades_no_coinciden"])
    expect(result.failed).toBe(true)
    expect(String(result.data.error)).toContain("La tabla «Distribución y planificación de las unidades» no se puede cambiar desde el editor.")
    expect(draft.payload().block_changes).toBeUndefined()
  })

  it("keeps an old long-form proposal with the old header style valid, and accepts it from the AI", async () => {
    const draft = AssistantDraft.fromTemplate(template)
    await designed(draft)
    const block = record(record(draft.payload().block_changes)[KIND])
    const styled = { ...block, layout: documentLines({ type: "doc", content: block.layout }).map((line) => line.replaceAll("<th>", '<th style="background:#C3D4EA;font-weight:bold">')) }
    const stored = { ...draft.payload(), block_changes: { [KIND]: defineBlock(KIND, styled, Object.keys(template.definition?.variables ?? {})) } }

    const problems = await draftProblems(toRuntime(JSON.parse(JSON.stringify(stored))) as PhpRecord, template.definition as NonNullable<SyllabusTemplate["definition"]>)
    const again = AssistantDraft.fromTemplate(template)
    const result = await use(toolsFor(again), "escribir_tabla", { clave: KIND, tabla: JSON.stringify(styled) })

    expect(problems).toEqual([])
    expect(result.failed).toBe(false)
    expect(await draftValidator.errors(again)).toEqual([])
  })

  it("describes who fills each field with the names on screen", () => {
    const prompt = templateSystemPrompt()

    expect(prompt).not.toMatch(/editable|¿Se puede editar|puede pasar a No/i)
    expect(prompt).toContain("el responsable se elige en «¿Quién lo llena?»")
    expect(prompt).toContain("Usted no puede elegir «Solo el docente»")
  })

  it("explains the short form and the rule names in the knowledge", () => {
    const prompt = templateSystemPrompt()

    expect(prompt).toContain("escribir_tabla")
    expect(prompt).toContain("ver_tabla")
    for (const name of ["semanas_maximas", "libros_sin_titulo", "«texto largo»", "«sí/no»", "«horas»"]) expect(prompt).toContain(name)
    expect(prompt).not.toContain("background:#C3D4EA;font-weight:bold")
  })
})
