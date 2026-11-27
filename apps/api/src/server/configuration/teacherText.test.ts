// @vitest-environment node
import { describe, expect, it } from "vitest"
import { careerFieldUndecided } from "@silabos/shared/lib/responseKinds"
import type { DocumentNode } from "@silabos/shared/lib/templateDocument"
import type { PhpRecord } from "./phpValues"
import { fieldPending, profileTemplateOf } from "./subjectProfileFields"
import { syllabusSectionPayload, teacherEditable, type TemplateField } from "./templatePresentation"
import { fieldResponseNormalize } from "./templateRehearsal"
import { careerResponse, fieldCarried, fieldFits, followTemplate, normalizeFieldDocument, responseIsEmpty, type TemplateDefinition } from "./templateRuntime"
import { hasOwnText, teacherEdits } from "./teacherText"

const definition = { document: {}, variables: {}, blocks: {}, response_policy: "protected" } as unknown as TemplateDefinition

const line = (text: string): PhpRecord => ({ type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text }] })
const doc = (...texts: string[]): PhpRecord => ({ type: "doc", content: texts.map(line) })
const marked = (document: PhpRecord): PhpRecord => ({ ...document, attrs: { teacherEdits: true } })
const space = (): PhpRecord => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "response", attrs: { kind: "texto", options: [], value: null } }] }] })
const table = (...cells: string[]): PhpRecord => ({
  type: "doc",
  content: [{ type: "table", content: [{ type: "tableRow", content: cells.map((text) => ({ type: "tableCell", content: [line(text)] })) }] }],
})
const textOf = (value: unknown): string => JSON.stringify((value as PhpRecord).content)

const institutional = doc("Texto de la plantilla")
const coordinator = () => careerResponse(institutional, marked(doc("Texto de Coordinación")), definition)

describe("coordinación marca «El docente puede editar este texto»", () => {
  it("guarda la marca junto al texto", () => {
    const saved = coordinator()
    expect(teacherEdits(saved)).toBe(true)
    expect(textOf(saved)).toContain("Texto de Coordinación")
  })

  it("conserva la marca al leer lo guardado y al resolver la plantilla de la materia", () => {
    expect(teacherEdits(followTemplate(institutional, coordinator(), definition))).toBe(true)
    expect(teacherEdits(profileTemplateOf(institutional, coordinator(), definition))).toBe(true)
  })

  it("cuenta como definido aunque deje el texto de la plantilla", () => {
    const saved = careerResponse(institutional, marked(institutional), definition)
    expect(fieldPending(institutional, saved, definition)).toBe(false)
    expect(careerFieldUndecided(institutional as unknown as DocumentNode, marked(institutional) as unknown as DocumentNode)).toBe(false)
    expect(fieldPending(institutional, null, definition)).toBe(true)
  })

  it("no la admite en un campo con espacios de respuesta", () => {
    expect(() => careerResponse(institutional, marked(space()), definition)).toThrow()
  })

  it("sin la marca, el texto sigue bloqueado para el docente", () => {
    const saved = careerResponse(institutional, doc("Texto de Coordinación"), definition)
    expect(teacherEdits(saved)).toBe(false)
    expect(teacherEditable({ id: "f", responsible: "carrera" } as TemplateField, { f: saved })).toBe(false)
    expect(() => fieldResponseNormalize(saved, doc("Cambio del docente"), definition)).toThrow()
  })
})

describe("texto del docente", () => {
  it("puede cambiarlo y queda como texto propio", () => {
    const template = coordinator()
    expect(teacherEditable({ id: "f", responsible: "carrera" } as TemplateField, { f: template })).toBe(true)
    const own = fieldResponseNormalize(template, doc("Cambio del docente", "Otra línea"), definition)
    expect(textOf(own)).toContain("Cambio del docente")
    expect(hasOwnText(own)).toBe(true)
  })

  it("restaurar el texto original deja de contar como propio", () => {
    const template = coordinator()
    const restored = fieldResponseNormalize(template, { ...doc("Texto de Coordinación"), attrs: { ownText: true } }, definition)
    expect(hasOwnText(restored)).toBe(false)
  })

  it("no puede quitar columnas de las tablas ni agregar espacios", () => {
    const template = careerResponse(table("Uno", "Dos"), marked(table("Uno", "Dos")), definition)
    expect(() => fieldResponseNormalize(template, table("Uno"), definition)).toThrow()
    expect(textOf(fieldResponseNormalize(template, table("Uno", "Cambiado"), definition))).toContain("Cambiado")
    expect(() => fieldResponseNormalize(coordinator(), space(), definition)).toThrow()
  })

  it("si no lo tocó, recibe el texto nuevo de Coordinación", () => {
    const before = normalizeFieldDocument(coordinator(), definition)
    const next = careerResponse(institutional, marked(doc("Texto nuevo")), definition)
    expect(fieldFits(next, before, definition)).toBe(false)
    expect(textOf(fieldCarried(next, before, definition))).toContain("Texto nuevo")
  })

  it("si ya lo cambió, conserva el suyo", () => {
    const template = coordinator()
    const own = fieldResponseNormalize(template, doc("Cambio del docente"), definition)
    const next = careerResponse(institutional, marked(doc("Texto nuevo")), definition)
    expect(fieldFits(next, own, definition)).toBe(true)
    const carried = fieldCarried(next, own, definition) as PhpRecord
    expect(textOf(carried)).toContain("Cambio del docente")
  })

  it("si Coordinación quita la marca, vuelve el texto de Coordinación", () => {
    const own = fieldResponseNormalize(coordinator(), doc("Cambio del docente"), definition)
    const locked = careerResponse(institutional, doc("Texto fijo"), definition)
    expect(fieldFits(locked, own, definition)).toBe(false)
    expect(textOf(fieldCarried(locked, own, definition))).toContain("Texto fijo")
  })
})

describe("un campo que es entero «Texto libre» se escribe con formato", () => {
  const blankDoc = { type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "left" } }] }
  const lone = (value: string, attrs: PhpRecord = {}): PhpRecord => ({ type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "response", attrs: { kind: "texto", options: [], value, ...attrs } }] }] })
  const list: PhpRecord = { type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [line("Con viñeta")] }] }] }
  const section = (held: unknown, template: PhpRecord) =>
    (syllabusSectionPayload(
      { id: "s", key: "s", title: "S", orientation: "vertical", blocks: [{ id: "b", fields: [{ id: "f", key: "metodologia", label: "Métodos", responsible: "carrera", content: blankDoc }] }] } as never,
      () => held,
      {},
      definition,
      { f: template },
    ).fields as PhpRecord[])[0]

  it("el docente recibe un campo en blanco, no la caja simple", () => {
    const field = section(lone(""), lone(""))
    expect(field.teacher_editable).toBe(true)
    expect(JSON.stringify(field.template)).not.toContain("response")
    expect(JSON.stringify(field.value)).not.toContain("response")
  })

  it("lo que ya había escrito en la caja se conserva como párrafos", () => {
    const field = section(lone("Primera\nSegunda"), lone(""))
    expect((field.value as PhpRecord).content).toEqual([line("Primera"), line("Segunda")])
  })

  it("admite listas y formato, y sigue contando como vacío si no escribe", () => {
    expect(textOf(fieldResponseNormalize(lone(""), list, definition))).toContain("Con viñeta")
    expect(fieldFits(lone(""), list, definition)).toBe(true)
    expect(textOf(fieldCarried(lone(""), lone("Ya escrito"), definition))).toContain("Ya escrito")
    expect(responseIsEmpty(lone(""), lone(""), definition)).toBe(true)
    expect(responseIsEmpty(lone(""), list, definition)).toBe(false)
  })

  it("una respuesta con límite propio sigue como respuesta", () => {
    const field = section(lone("", { maxLength: 50 }), lone("", { maxLength: 50 }))
    expect(JSON.stringify(field.template)).toContain("response")
  })
})

describe("los encabezados de las tablas no se pueden cambiar", () => {
  const cell = (type: string, text: string): PhpRecord => ({ type, content: [text === "" ? { type: "paragraph", attrs: { textAlign: "left" } } : line(text)] })
  const grid = (header: string, body: string): PhpRecord => ({
    type: "doc",
    content: [{ type: "table", content: [{ type: "tableRow", content: [cell("tableHeader", header)] }, { type: "tableRow", content: [cell("tableCell", body)] }] }],
  })
  const base = grid("Resultados de aprendizaje", "Fijo")

  it("Coordinación no puede guardar un encabezado cambiado, pero sí las celdas", () => {
    expect(() => careerResponse(base, grid("Resultados de aprendizaj", "Fijo"), definition)).toThrow()
    expect(() => careerResponse(base, grid("", "Fijo"), definition)).toThrow()
    expect(textOf(careerResponse(base, grid("Resultados de aprendizaje", "Otra celda"), definition))).toContain("Otra celda")
  })

  it("lo que ya se guardó con un encabezado recortado se lee con el de la plantilla", () => {
    const stored = { ...grid("Resultados de aprendizaj", "Otra celda"), attrs: { edited: true } }
    const read = textOf(followTemplate(base, stored, definition))
    expect(read).toContain("Resultados de aprendizaje")
    expect(read).toContain("Otra celda")
    expect(textOf(careerResponse(base, stored, definition, "value", false))).toContain("Resultados de aprendizaje")
  })

  it("el docente con permiso de editar tampoco puede cambiarlos", () => {
    const template = careerResponse(base, marked(base), definition)
    expect(() => fieldResponseNormalize(template, grid("Otro título", "Fijo"), definition)).toThrow()
  })
})
