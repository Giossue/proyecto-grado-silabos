// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import type { PhpRecord } from "../configuration/phpValues"
import type { SyllabusTemplate } from "../configuration/templatePresentation"
import { normalizeFieldDocument, type TemplateDefinition } from "../configuration/templateRuntime"
import { fakeTemplateStore } from "../configuration/testing"
import { InProgressWork } from "./inProgressWork"

const PROCESS = "0195e7a0-0000-7000-8000-000000000007"
const CONVOCATION = "0195e7a0-0000-7000-8000-000000000002"
const PARALLEL = "0195e7a0-0000-7000-8000-000000000003"
const SUBJECT = "0195e7a0-0000-7000-8000-000000000004"
const FIELD = "0195e7a0-0000-7000-8000-0000000000a1"
const RETIRED = "0195e7a0-0000-7000-8000-0000000000a2"
const syllabusId = (index: number) => `0195e7a0-0000-7000-8000-00000000010${index}`

const teacherOnlyDefinition = { document: {}, variables: {}, blocks: {}, response_policy: "protected", teacher_fields: ["propio"] } as unknown as TemplateDefinition
const coordinationDefinition = { ...teacherOnlyDefinition, teacher_fields: [] } as TemplateDefinition

const line = (text: string): PhpRecord => (text === "" ? { type: "paragraph", attrs: { textAlign: "left" } } : { type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text }] })
const cell = (type: string, text: string): PhpRecord => ({ type, content: [line(text)] })
const tableOf = (headers: string[], ...rows: string[][]): PhpRecord => ({
  type: "doc",
  content: [
    {
      type: "table",
      content: [
        { type: "tableRow", content: headers.map((text) => cell("tableHeader", text)) },
        ...rows.map((texts) => ({ type: "tableRow", content: texts.map((text) => cell("tableCell", text)) })),
      ],
    },
  ],
})
const doc = (...texts: string[]): PhpRecord => ({ type: "doc", content: texts.map(line) })
const normalized = (value: PhpRecord): PhpRecord => normalizeFieldDocument(value, teacherOnlyDefinition)
const own = (value: PhpRecord): PhpRecord => ({ ...normalized(value), attrs: { ownText: true } })

const BLANK = ["", ""]
const original = tableOf(["Resultado", "Alta"], BLANK, BLANK)
const written = own(tableOf(["Resultado", "Alta"], ["Analiza datos", "X"], ["Diseña redes", ""]))

type Stored = { value: unknown; fieldId?: string; live?: boolean; key?: string }
type Setup = { content?: PhpRecord; definition?: TemplateDefinition; profile?: unknown; responsible?: string; syllabi: Stored[][]; state?: string; started?: boolean; removed?: boolean }

function templateOf(setup: Setup): SyllabusTemplate {
  const definition = setup.definition ?? teacherOnlyDefinition
  const content = setup.content ?? original
  const fields = setup.removed ? [] : [{ id: FIELD, blockId: "b", key: "propio", label: "Punto nueve", responsible: setup.responsible ?? "carrera", content }]
  return { id: "t", modifiedAt: null, definition, sections: [{ id: "s", key: "s", title: "Evaluación", orientation: "portrait", position: 1, blocks: [{ id: "b", key: "propio", title: "Punto nueve", position: 1, fields }] }] }
}

function held(value: unknown, extra: Partial<Stored> = {}): Stored {
  return { value, ...extra }
}

function harness(setup: Setup) {
  const template = templateOf(setup)
  const executed: string[] = []
  const rows = setup.syllabi.map((_, index) => ({ id: syllabusId(index), convocation_id: CONVOCATION, parallel_id: PARALLEL, state: setup.state ?? "borrador", context: "{}", started: setup.started ?? true, version: 3 }))
  const statements: string[] = []
  const reply = (text: string, values: unknown[]): unknown[] => {
    if (text.startsWith("select convocatoria_carrera_id::text as id from convocatorias_carreras")) return [{ id: CONVOCATION }]
    if (text.startsWith("select silabos.silabo_id::text as id, silabos.convocatoria_carrera_id")) return rows
    if (text.startsWith("select asignatura_id::text as id from paralelos")) return [{ id: SUBJECT }]
    if (text.startsWith("select asignatura.nombre_asignatura as name")) return [{ name: "Cálculo I" }]
    if (text.includes("from valores_campo where silabo_id")) {
      const index = rows.findIndex((row) => values.includes(row.id))
      return (setup.syllabi[index] ?? []).map((item) => ({ field_id: item.fieldId ?? FIELD, value: JSON.stringify(item.value) }))
    }
    if (text.includes("from definiciones_campo definicion")) {
      return setup.syllabi.flat().map((item) => ({ id: item.fieldId ?? FIELD, key: item.key ?? "propio", live: item.live ?? true }))
    }
    return []
  }
  const run = (kind: string) => async (query: Prisma.Sql) => {
    const text = query.text.replace(/\s+/g, " ").trim()
    statements.push(text)
    if (kind === "execute") {
      executed.push(text)
      return 1
    }
    return reply(text, query.values)
  }
  const work = new InProgressWork({ $queryRaw: run("query"), $executeRaw: run("execute") } as unknown as Db, () => {})
  const store = fakeTemplateStore({ template, values: setup.profile === undefined ? [] : [{ fieldId: FIELD, subjectId: SUBJECT, value: setup.profile }] })
  const context = { template, definition: template.definition, store }
  vi.spyOn(work, "profileContext").mockResolvedValue(context)
  return { work, executed, statements, context }
}

async function adaptedValues(setup: Setup): Promise<string> {
  const { work } = harness(setup)
  const inserted: string[] = []
  const executor = work.executor as unknown as { $executeRaw: (query: Prisma.Sql) => Promise<number> }
  executor.$executeRaw = async (query) => {
    if (query.text.includes("insert into valores_campo")) inserted.push(String(query.values[3]))
    return 1
  }
  await work.adaptToTemplate({ id: syllabusId(0), convocationId: CONVOCATION, parallelId: PARALLEL, state: "borrador", context: {}, started: true, version: 3 })
  return inserted.join("")
}

describe("al adaptar un sílabo a la plantilla", () => {
  it("corregir un encabezado conserva las filas del docente", async () => {
    const result = await adaptedValues({ content: tableOf(["Resultado de aprendizaje", "Alta (A)"], BLANK, BLANK), syllabi: [[held(written)]] })
    expect(result).toContain("Resultado de aprendizaje")
    expect(result).toContain("Analiza datos")
  })

  it("corregir un encabezado de una tabla de Coordinación conserva lo que llenó el docente", async () => {
    const answers = normalizeFieldDocument(tableOf(["Actividad", "Horas"], ["Taller", "4"]), coordinationDefinition)
    const result = await adaptedValues({ content: tableOf(["Actividades", "Horas"], BLANK), definition: coordinationDefinition, syllabi: [[held(answers)]] })
    expect(result).toContain("Actividades")
    expect(result).toContain("Taller")
  })

  it("si el cambio no deja dónde poner el texto, se aplica igual con la plantilla nueva", async () => {
    const result = await adaptedValues({ content: tableOf(["Resultado", "Alta", "Media"], ["", "", ""]), syllabi: [[held(written)]] })
    expect(result).toContain("Media")
    expect(result).not.toContain("Analiza datos")
  })
})

describe("la adaptación elige siempre el mismo valor anterior", () => {
  const retired = (value: unknown) => held(value, { fieldId: RETIRED, live: false })
  const current = (value: unknown) => held(value)

  const adapted = (values: Stored[]) => adaptedValues({ syllabi: [values] })

  const other = own(tableOf(["Resultado", "Alta"], ["Texto del campo retirado", ""]))

  it("gana el del campo vigente con texto, en cualquier orden", async () => {
    for (const values of [
      [current(written), retired(other)],
      [retired(other), current(written)],
    ]) {
      const result = await adapted(values)
      expect(result).toContain("Analiza datos")
      expect(result).not.toContain("campo retirado")
    }
  })

  it("si el vigente está vacío usa el que tiene texto, en cualquier orden", async () => {
    const empty = own(doc(""))
    for (const values of [
      [current(empty), retired(other)],
      [retired(other), current(empty)],
    ]) {
      expect(await adapted(values)).toContain("campo retirado")
    }
  })
})
