// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import { InProgressWork } from "../syllabus/inProgressWork"
import { carryTeacherFields } from "../syllabus/teacherFields"
import { officialDefinition, officialSections } from "./officialTemplate"
import type { PhpRecord } from "./phpValues"
import { profileFields, profileProgress, profileTemplates } from "./subjectProfileFields"
import { DraftRequest, prepareDraft } from "./templateDraft"
import { syllabusSectionPayload, teacherEditable, type SyllabusTemplate, type TemplateField } from "./templatePresentation"
import { fieldResponseNormalize, rehearseImpact, type RehearsalStore } from "./templateRehearsal"
import { careerResponse, fieldCarried, normalizeFieldDocument, type TemplateDefinition } from "./templateRuntime"
import { fakeTemplateStore } from "./testing"
import { hasOwnText } from "./teacherText"

const definition = { document: {}, variables: {}, blocks: {}, response_policy: "protected", teacher_fields: ["propio"] } as unknown as TemplateDefinition
const coordinated = { ...definition, teacher_fields: [] } as TemplateDefinition
const withPlan = { ...definition, blocks: { plan: { label: "Plan", value: [], layout: [] } } } as unknown as TemplateDefinition

const line = (text: string): PhpRecord => (text === "" ? { type: "paragraph", attrs: { textAlign: "left" } } : { type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text }] })
const doc = (...texts: string[]): PhpRecord => ({ type: "doc", content: texts.map(line) })
const head = (...texts: string[]): PhpRecord => ({ type: "tableRow", content: texts.map((text) => ({ type: "tableHeader", content: [line(text)] })) })
const row = (...texts: string[]): PhpRecord => ({ type: "tableRow", content: texts.map((text) => ({ type: "tableCell", content: [line(text)] })) })
const grid = (...rows: PhpRecord[]): PhpRecord => ({ type: "doc", content: [{ type: "table", content: [head("Resultado", "ALTA (A)"), ...rows] }] })
const blankRows = (count: number): PhpRecord[] => Array.from({ length: count }, () => row("", ""))
const four = grid(...blankRows(4))
const ethics = doc("Se aplicará el código de ética.")
const empty = doc("")

const rowsOf = (document: unknown): string[][] => {
  const found: string[][] = []
  const text = (node: PhpRecord): string => (node.type === "text" ? String(node.text) : ((node.content ?? []) as PhpRecord[]).map(text).join(""))
  const visit = (node: PhpRecord): void => {
    if (node.type === "tableRow") found.push(((node.content ?? []) as PhpRecord[]).map(text))
    else for (const child of (node.content ?? []) as PhpRecord[]) visit(child)
  }
  visit(document as PhpRecord)
  return found
}
const textOf = (document: unknown): string => {
  const node = document as PhpRecord
  return node.type === "text" ? String(node.text) : ((node?.content ?? []) as PhpRecord[]).map(textOf).join("")
}

const fieldOf = (content: PhpRecord): TemplateField => ({ id: "f", blockId: "b", key: "propio", label: "Propio", responsible: "carrera", content })

function templateWith(content: PhpRecord, using: TemplateDefinition = definition): SyllabusTemplate {
  return { id: "t", modifiedAt: null, definition: using, sections: [{ id: "s", key: "s", title: "S", orientation: "portrait", position: 1, blocks: [{ id: "b", key: "propio", title: "Propio", position: 1, fields: [fieldOf(content)] }] }] }
}

function contextFor(content: PhpRecord, profile: PhpRecord | null, using: TemplateDefinition = definition) {
  const template = templateWith(content, using)
  return { template, definition: using, store: fakeTemplateStore({ template, values: profile === null ? [] : [{ fieldId: "f", subjectId: "m", value: profile }] }) }
}

const teacherTemplate = async (content: PhpRecord, profile: PhpRecord | null = null) => (await profileTemplates(contextFor(content, profile), "m")).f

async function shown(content: PhpRecord, held: unknown, profile: PhpRecord | null = null): Promise<PhpRecord> {
  const context = contextFor(content, profile)
  const section = context.template.sections[0]
  const templates = await profileTemplates(context, "m")
  return (syllabusSectionPayload(section, () => held ?? templates.f ?? content, {}, definition, templates).fields as PhpRecord[])[0]
}

const careerText = (content: PhpRecord, value: PhpRecord) => careerResponse(content, value, coordinated)

describe("S2: un campo «Solo el docente» no usa el proyecto de carrera", () => {
  it("no aparece en el proyecto de carrera ni cuenta como «Sin definir»", async () => {
    const context = contextFor(ethics, null)
    expect(profileFields(context)).toEqual([])
    expect((await profileProgress(context, ["m"])).get("m")).toEqual({ filled: 0, total: 0 })
  })

  it("un valor antiguo del proyecto de carrera no se usa y no se borra", async () => {
    const profile = careerText(ethics, doc("Texto viejo de la carrera"))
    const context = contextFor(ethics, profile)
    const field = await shown(ethics, null, profile)
    expect(textOf(field.value)).toBe("Se aplicará el código de ética.")
    expect(field.teacher_editable).toBe(true)
    expect(await context.store.subjectValues("m")).toHaveLength(1)
  })
})

describe("S3: el docente recibe el contenido de la plantilla y lo edita entero", () => {
  it("un texto se edita entero, sin aviso ni plantilla de espacios", async () => {
    const field = await shown(ethics, null)
    expect(field.teacher_edits).toBe(true)
    expect(field).not.toHaveProperty("template")
    const written = fieldResponseNormalize(await teacherTemplate(ethics), { ...doc("Mi compromiso"), attrs: { ownText: true } }, definition, "value", ethics)
    expect(hasOwnText(written)).toBe(true)
    expect(textOf((await shown(ethics, written)).value)).toBe("Mi compromiso")
  })

  it("vacío, lo escribe en el mismo editor de siempre", async () => {
    const field = await shown(empty, null)
    expect(field.teacher_editable).toBe(true)
    expect(field).not.toHaveProperty("teacher_edits")
    expect(textOf(fieldResponseNormalize(await teacherTemplate(empty), doc("Lo escribe el docente"), definition, "value", empty))).toBe("Lo escribe el docente")
  })

  it("lo que no tocó sigue a la plantilla cuando Administración cambia el texto", async () => {
    const generated = await teacherTemplate(ethics)
    const reverted = fieldResponseNormalize(generated, { ...ethics, attrs: { ownText: true } }, definition, "value", ethics)
    expect(textOf((await shown(doc("Texto nuevo de Administración"), reverted)).value)).toBe("Texto nuevo de Administración")
    expect(textOf((await shown(doc("Texto nuevo de Administración"), generated)).value)).toBe("Texto nuevo de Administración")
  })

  it.each([
    ["que venía del proyecto de carrera", careerText(ethics, doc("Texto de la carrera"))],
    ["con la marca «El docente puede editar este texto»", careerText(ethics, { ...doc("Texto de la carrera"), attrs: { teacherEdits: true } })],
    ["propio del docente", { ...doc("Texto de la carrera"), attrs: { ownText: true } }],
    ["guardado sin marcas", doc("Texto de la carrera")],
  ])("conserva un texto %s al mostrarlo, copiarlo y heredarlo", async (_name, held) => {
    const template = await teacherTemplate(ethics)
    expect(textOf((await shown(ethics, held)).value)).toBe("Texto de la carrera")
    expect(textOf(fieldResponseNormalize(template, held, definition, "value", ethics))).toBe("Texto de la carrera")
    expect(textOf(fieldCarried(template, held, definition, ethics))).toBe("Texto de la carrera")
  })

  it("conserva como texto lo contestado en una respuesta que ponía Coordinación", async () => {
    const answered = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Modalidad: " }, { type: "response", attrs: { kind: "varias", options: [{ const: "o1", title: "Aula" }, { const: "o2", title: "Virtual" }], value: ["o1", "o2"] } }] }] }
    for (const content of [empty, ethics]) {
      const template = await teacherTemplate(content)
      expect(textOf((await shown(content, answered)).value)).toBe("Modalidad: Aula, Virtual")
      expect(textOf(fieldResponseNormalize(template, answered, definition, "value", content))).toBe("Modalidad: Aula, Virtual")
    }
  })

  it("una copia sin escribir de una plantilla anterior con otras filas vacías sigue a la vigente", async () => {
    expect(rowsOf((await shown(four, normalizeFieldDocument(grid(row("", "")), definition))).value)).toHaveLength(5)
  })

  it("una tabla con formulario sigue con su formulario", async () => {
    const content: PhpRecord = { type: "doc", content: [{ type: "documentBlock", attrs: { kind: "plan", props: [], value: [] } }] }
    expect(await profileTemplates(contextFor(content, null, withPlan), "m")).toEqual({})
    expect(teacherEditable(fieldOf(content), {})).toBe(true)
  })
})

describe("S4: la tabla de texto de un campo «Solo el docente»", () => {
  it("admite filas aunque la plantilla empiece con cuatro vacías", async () => {
    expect((await shown(four, null)).row_tables).toEqual([true])
  })

  it("agrega y quita filas dejando al menos una, con la X en la celda", async () => {
    const template = await teacherTemplate(four)
    const save = (value: PhpRecord) => fieldResponseNormalize(template, { ...value, attrs: { ownText: true } }, definition, "value", four)
    expect(rowsOf(save(grid(row("Analiza", "X"))))).toEqual([["Resultado", "ALTA (A)"], ["Analiza", "X"]])
    expect(rowsOf(save(grid(...blankRows(4), row("Otro", "X"))))).toHaveLength(6)
    expect(() => save(grid())).toThrow("tablas")
  })

  it("no admite cambiar columnas ni encabezados", async () => {
    const template = await teacherTemplate(four)
    const save = (value: PhpRecord) => fieldResponseNormalize(template, { ...value, attrs: { ownText: true } }, definition, "value", four)
    expect(() => save(grid(row("Analiza", "X", "extra")))).toThrow()
    expect(() => save({ type: "doc", content: [{ type: "table", content: [head("Otro", "ALTA (A)"), row("a", "")] }] })).toThrow("encabezados")
  })

  it("al heredarlo conserva las filas del docente", async () => {
    const template = await teacherTemplate(four)
    const own = fieldResponseNormalize(template, { ...grid(row("Analiza", "X"), row("Evalúa", "")), attrs: { ownText: true } }, definition, "value", four)
    expect(rowsOf(fieldCarried(template, own, definition, four))).toEqual(rowsOf(own))
  })

  it("en un campo de Coordinación, varias filas vacías siguen siendo fijas", () => {
    expect(() => careerResponse(four, grid(row("Analiza", "X")), coordinated)).toThrow("tablas")
  })
})

type Held = { id: string; key: string; value: unknown }

async function adapted(content: PhpRecord, held: Held[], state = "borrador", started = true): Promise<{ values: Record<string, PhpRecord>; restarted: boolean }> {
  const written: Record<string, PhpRecord> = {}
  const run = async (query: Prisma.Sql) => {
    const text = query.text.replace(/\s+/g, " ").trim()
    if (text.startsWith("select definicion_campo_id::text as field_id, valor_campo::text as value")) return held.map((item) => ({ field_id: item.id, value: JSON.stringify(item.value) }))
    if (text.startsWith("select definicion.definicion_campo_id::text as id, campo.clave_campo_plantilla")) return held.map((item) => ({ id: item.id, key: item.key }))
    if (text.startsWith("select asignatura_id::text")) return [{ id: "m" }]
    if (text.startsWith("insert into valores_campo")) written[query.values[2] as string] = JSON.parse(query.values[3] as string)
    if (text.startsWith("update valores_campo")) written[query.values[query.values.length - 1] as string] = JSON.parse(query.values[0] as string)
    return []
  }
  const work = new InProgressWork({ $queryRaw: run, $executeRaw: run } as unknown as Db, () => {})
  const context = contextFor(content, doc("Valor viejo del proyecto de carrera"))
  vi.spyOn(work, "profileContext").mockResolvedValue(context)
  let restarted = false
  work.restartSyllabus = async () => ((restarted = true), "nuevo")
  await work.adaptToTemplate({ id: "silabo", convocationId: "c", parallelId: "p", state, context: {}, started, version: 1 })
  return { values: written, restarted }
}

describe("al adaptar los sílabos en curso a la plantilla", () => {
  it.each([
    ["el texto que venía del proyecto de carrera", careerText(ethics, doc("Texto de la carrera"))],
    ["lo que escribió el docente", { ...doc("Texto de la carrera"), attrs: { ownText: true } }],
  ])("conserva %s en el campo que pasa a «Solo el docente»", async (_name, value) => {
    const result = await adapted(ethics, [{ id: "anterior", key: "propio", value }])
    expect(textOf(result.values.f)).toBe("Texto de la carrera")
    expect(hasOwnText(result.values.f)).toBe(true)
  })

  it("conserva el texto y las filas del punto 9 y entrega cuatro filas al que no escribió nada", async () => {
    const filled = careerText(grid(row("", "")), grid(row("Analiza", "X"), row("Evalúa", "")))
    expect(rowsOf((await adapted(four, [{ id: "anterior", key: "propio", value: filled }])).values.f).slice(1)).toEqual([["Analiza", "X"], ["Evalúa", ""]])
    expect(rowsOf((await adapted(four, [{ id: "anterior", key: "propio", value: normalizeFieldDocument(grid(row("", "")), definition) }])).values.f)).toHaveLength(5)
  })

  it("un sílabo sin abrir que se rehace no pierde el texto que ya tenía", async () => {
    const run = vi.fn()
    const result = await adapted(ethics, [{ id: "anterior", key: "propio", value: careerText(ethics, doc("Texto de la carrera")) }], "sin_iniciar", false)
    expect(run).not.toHaveBeenCalled()
    expect(result.restarted).toBe(true)
    expect(textOf(result.values.f)).toBe("Texto de la carrera")
  })

  it("el ensayo del impacto no cuenta ese texto como perdido", async () => {
    const before = templateWith(ethics, coordinated)
    const reads = {
      lockTemplate: async () => {},
      currentTemplate: async () => before,
      syllabi: async () => [{ id: "silabo", state: "borrador", subjectId: "m", career: "Software" }],
      syllabusValues: async () => [{ fieldId: "f", value: { ...doc("Mi texto"), attrs: { ownText: true } } }],
      fieldKeys: async () => new Map([["f", "propio"]]),
      store: fakeTemplateStore({ template: before, values: [] }),
    }
    const store: RehearsalStore = { pausedProcess: async () => "p", rehearse: async (work) => work(reads) }
    const impact = await rehearseImpact(store, "t", [{ key: "s", title: "S", orientation: "portrait", fields: [{ key: "propio", label: "Propio", responsible: "carrera", content: ethics }] }], definition)
    expect(impact).toMatchObject({ in_progress: 1, keep: 1, lose: 0 })
    const editable: RehearsalStore = { pausedProcess: async () => "p", rehearse: async (work) => work({ ...reads, currentTemplate: async () => templateWith(ethics), syllabusValues: async () => [{ fieldId: "f", value: doc("Texto anterior sin marcas") }] }) }
    expect(await rehearseImpact(editable, "t", [{ key: "s", title: "S", orientation: "portrait", fields: [{ key: "propio", label: "Propio", responsible: "carrera", content: ethics }] }], definition)).toMatchObject({ keep: 1, lose: 0 })
  })
})

describe("copiar entre sílabos los datos personales del docente", () => {
  it("solo trae campos de texto vacíos en la plantilla, nunca tablas ni textos propios de la materia", async () => {
    const asked: unknown[] = []
    const db = {
      $queryRaw: async (query: Prisma.Sql) => (asked.push(query), []),
      $executeRaw: async () => 1,
    } as unknown as Db
    await carryTeacherFields(db, "silabo", templateWith(four), () => "id")
    await carryTeacherFields(db, "silabo", templateWith({ type: "doc", content: [{ type: "documentBlock", attrs: { kind: "plan", props: [], value: [] } }] }, withPlan), () => "id")
    expect(asked).toEqual([])
    await carryTeacherFields(db, "silabo", templateWith(empty), () => "id")
    expect(asked.length).toBeGreaterThan(0)
  })
})

describe("S1: guardar «¿Quién lo llena?» desde el editor de la plantilla", () => {
  const draft = (extra: PhpRecord, responsible = "carrera") =>
    new DraftRequest(prepareDraft({ version: 1, sections: [{ key: "s", title: "S", fields: [{ key: "propio", label: "P", quien_llena: responsible, content: doc("x") }] }], ...extra }), definition).definition().teacher_fields

  it("guarda las claves que llena solo el docente y permite quitarlas", () => {
    expect(draft({ teacher_fields: ["propio"] })).toEqual(["propio"])
    expect(draft({ teacher_fields: [] })).toEqual([])
  })

  it("sin la lista conserva la vigente y no admite un campo que nadie llena", () => {
    expect(draft({})).toEqual(["propio"])
    expect(draft({ teacher_fields: ["propio"] }, "institucional")).toEqual([])
  })

  it("rechaza una clave que no es un campo", () => {
    expect(() => draft({ teacher_fields: ["otro"] })).toThrow()
  })
})

describe("S7: la plantilla oficial", () => {
  const fields = officialSections().flatMap((section) => section.fields.map((field) => ({ ...field, section: section.key })))
  const teacher = officialDefinition().teacher_fields as string[]
  const keysIn = (...sections: string[]) => fields.filter((field) => sections.includes(field.section))

  it("Coordinación llena solo los puntos 2, 3, 4, 5 y 7", () => {
    const coordination = fields.filter((field) => field.responsible === "carrera" && !teacher.includes(field.key))
    expect(coordination).toEqual(keysIn("descripcion", "objetivos", "resultados", "habilidades", "metodologia"))
  })

  it("los puntos 1, 6, 9, 10 y la bibliografía del 11 los llena solo el docente", () => {
    expect([...teacher].sort()).toEqual(["asignatura", "nombre_campus", "correquisitos_asignatura", "formacion_docente", "unidades", "contribucion_perfil", "conducta_etica", "bibliografia", "bibliografia_complementaria"].sort())
    expect(fields.filter((field) => teacher.includes(field.key)).every((field) => field.responsible === "carrera")).toBe(true)
  })

  it("el punto 8, la verificación de bibliografía y las firmas no los llena nadie", () => {
    const nobody = fields.filter((field) => field.responsible === "institucional").map((field) => field.key)
    expect(nobody).toEqual(["indicadores_evaluacion", "componentes_evaluacion", "verificacion_bibliografia", "firmas"])
  })

  it("el docente recibe el punto 9 con tabla que admite filas y el punto 10 como texto editable", () => {
    const official = officialDefinition()
    const received = (key: string) => {
      const source = fields.find((item) => item.key === key)!
      const target = { id: key, blockId: key, key, label: "", responsible: source.responsible, content: source.content }
      const section = { id: "s", key: "s", title: "S", orientation: "portrait", position: 1, blocks: [{ id: key, key, title: "", position: 1, fields: [target] }] }
      return (syllabusSectionPayload(section, () => source.content, {}, official).fields as PhpRecord[])[0]
    }
    expect(received("contribucion_perfil")).toMatchObject({ teacher_edits: true, row_tables: [true] })
    expect(received("conducta_etica")).toMatchObject({ teacher_edits: true, teacher_editable: true })
    expect(received("unidades")).not.toHaveProperty("teacher_edits")
  })

  it("el punto 9 empieza con cuatro filas vacías", () => {
    const nine = fields.find((field) => field.key === "contribucion_perfil")!
    expect(rowsOf(nine.content).slice(2)).toEqual(Array.from({ length: 4 }, () => ["", "", "", "", ""]))
  })
})

describe("corregir un encabezado en la plantilla no borra la tabla del docente", () => {
  const renamed = (...rows: PhpRecord[]): PhpRecord => ({ type: "doc", content: [{ type: "table", content: [head("Resultados", "ALTA (A)"), ...rows] }] })
  const own = (): PhpRecord => ({ ...grid(row("DOCENTE 1", "X"), row("DOCENTE 2", "")), attrs: { ownText: true } })
  const corrected = renamed(...blankRows(4))

  it("al reanudar conserva las filas con el encabezado nuevo", async () => {
    const result = await adapted(corrected, [{ id: "anterior", key: "propio", value: own() }])
    expect(rowsOf(result.values.f)).toEqual([["Resultados", "ALTA (A)"], ["DOCENTE 1", "X"], ["DOCENTE 2", ""]])
    expect(hasOwnText(result.values.f)).toBe(true)
  })

  it("al reconstruir o copiar también las conserva", async () => {
    const template = await teacherTemplate(corrected)
    const carried = fieldCarried(template, own(), definition, corrected)
    expect(rowsOf(carried)).toEqual([["Resultados", "ALTA (A)"], ["DOCENTE 1", "X"], ["DOCENTE 2", ""]])
  })

  it("el docente sigue sin poder cambiar un encabezado al guardar", async () => {
    const template = await teacherTemplate(corrected)
    expect(() => fieldResponseNormalize(template, own(), definition, "value", corrected)).toThrow()
  })
})
