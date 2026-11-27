// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { PhpRecord } from "./phpValues"
import { fieldPending, profileTemplates, profileValues } from "./subjectProfileFields"
import { syllabusSectionPayload, teacherEditable, type SyllabusTemplate, type TemplateField } from "./templatePresentation"
import { fieldResponseNormalize } from "./templateRehearsal"
import { careerResponse, fieldCarried, fieldFits, followTemplate, normalizeFieldDocument, responseTemplate, type TemplateDefinition } from "./templateRuntime"
import { hasOwnText, teacherEdits, teacherFills } from "./teacherText"

const definition = { document: {}, variables: {}, blocks: {}, response_policy: "protected" } as unknown as TemplateDefinition

const line = (text: string): PhpRecord => (text === "" ? { type: "paragraph", attrs: { textAlign: "left" } } : { type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text }] })
const head = (...texts: string[]): PhpRecord => ({ type: "tableRow", content: texts.map((text) => ({ type: "tableHeader", content: [line(text)] })) })
const row = (...texts: string[]): PhpRecord => ({ type: "tableRow", content: texts.map((text) => ({ type: "tableCell", content: [line(text)] })) })
const grid = (...rows: PhpRecord[]): PhpRecord => ({ type: "doc", content: [{ type: "table", content: [head("Actividad", "Horas"), ...rows] }] })
const intro = (text: string, ...rows: PhpRecord[]): PhpRecord => ({ type: "doc", content: [line(text), ...(grid(...rows).content as PhpRecord[])] })

const list = grid(row("", ""))
const fixed = grid(row("Teoría", ""), row("Práctica", ""))
const filling = (document: PhpRecord): PhpRecord => ({ ...document, attrs: { teacherFills: true } })
const editing = (document: PhpRecord): PhpRecord => ({ ...document, attrs: { teacherEdits: true } })

const save = (admin: PhpRecord, value: PhpRecord) => careerResponse(admin, value, definition)
const read = (admin: PhpRecord, stored: unknown) => followTemplate(admin, stored, definition)!
const clean = (document: unknown) => normalizeFieldDocument(document, definition)
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

const field = { id: "f", blockId: "b", key: "carga", label: "Carga", responsible: "carrera", content: list } as TemplateField
const contextFor = (stored: PhpRecord | null) => ({
  template: { id: "t", modifiedAt: null, definition, sections: [{ id: "s", key: "s", title: "S", orientation: "portrait", blocks: [{ id: "b", fields: [field] }] }] } as unknown as SyllabusTemplate,
  definition,
  store: {
    subjectValues: async () => (stored === null ? [] : [{ fieldId: "f", subjectId: "m", value: stored }]),
    liveFields: async () => [{ id: "f", responsible: "carrera", content: list }],
  } as never,
})

describe("«El docente llena esta tabla»", () => {
  it("guarda la marca, la conserva al leer y deja de estar «Sin definir»", async () => {
    const saved = save(list, filling(list))
    expect(teacherFills(saved)).toBe(true)
    expect(teacherFills(read(list, saved))).toBe(true)
    expect(teacherFills((await profileValues(contextFor(saved), "m")).get("f"))).toBe(true)
    expect(fieldPending(list, saved, definition)).toBe(false)
  })

  it("conserva la marca aunque lo guardado traiga además «aceptada la plantilla»", async () => {
    const stored = { ...list, attrs: { accepted: true, teacherFills: true } }
    expect(teacherFills((await profileValues(contextFor(stored), "m")).get("f"))).toBe(true)
  })

  it("sin la marca y vacía sigue «Sin definir», también con filas vacías añadidas", () => {
    expect(fieldPending(list, null, definition)).toBe(true)
    const saved = save(list, grid(row("", ""), row("", "")))
    expect(fieldPending(list, saved, definition)).toBe(true)
    expect(rowsOf(saved)).toHaveLength(2)
  })

  it("el docente recibe la tabla como hoy y agrega o quita filas", async () => {
    const templates = await profileTemplates(contextFor(save(list, filling(grid(row("", ""), row("", ""))))), "m")
    const template = templates.f ?? list
    expect(teacherEditable(field, templates)).toBe(true)
    expect(teacherFills(templates.f)).toBe(false)
    const written = fieldResponseNormalize(template, grid(row("Lectura", "2"), row("Foro", "1"), row("Taller", "3")), definition)
    expect(rowsOf(written)).toHaveLength(4)
    expect(rowsOf(fieldResponseNormalize(template, grid(row("Lectura", "2")), definition))).toHaveLength(2)
  })

  it("la marca se descarta si Coordinación escribió en la tabla o no quedan celdas vacías", () => {
    expect(teacherFills(save(list, filling(grid(row("Lectura", "")))))).toBe(false)
    expect(teacherFills(save(grid(row("Teoría", "4")), filling(grid(row("Teoría", "4")))))).toBe(false)
    expect(teacherFills(read(list, filling(grid(row("Lectura", "")))))).toBe(false)
  })

  it("con las dos marcas antiguas guardadas queda la del texto, sin perderlo", () => {
    const saved = save(list, { ...grid(row("Lectura", "2")), attrs: { teacherEdits: true, teacherFills: true } })
    expect(teacherEdits(saved)).toBe(true)
    expect(rowsOf(saved)[1]).toEqual(["Lectura", "2"])
  })

  it("al reconstruir sílabos conserva lo que el docente ya escribió", async () => {
    const own = clean(grid(row("Lectura", "2"), row("Foro", "1")))
    const templates = await profileTemplates(contextFor(save(list, filling(list))), "m")
    const template = templates.f ?? list
    expect(fieldFits(template, own, definition)).toBe(true)
    expect(rowsOf(fieldCarried(filling(list), own, definition))).toHaveLength(3)
    expect(rowsOf(fieldCarried(filling(list), own, definition))[2]).toEqual(["Foro", "1"])
  })

  it("al cambiar la plantilla de Administración la marca se mantiene solo si la tabla sigue sin escribir", () => {
    const saved = save(list, filling(list))
    const renamed: PhpRecord = { type: "doc", content: [{ type: "table", content: [head("Tarea", "Horas"), row("", "")] }] }
    expect(teacherFills(read(renamed, saved))).toBe(true)
    expect(teacherFills(read({ type: "doc", content: [line("Sin tabla")] }, saved))).toBe(false)
  })
})

describe("filas de una tabla que admite filas", () => {
  it("Coordinación agrega filas y, al escribir, la tabla queda fija para el docente", async () => {
    const saved = save(list, grid(row("Lectura", "2"), row("Foro", "1")))
    expect(rowsOf(saved)).toHaveLength(3)
    const templates = await profileTemplates(contextFor(saved), "m")
    expect(teacherEditable(field, templates)).toBe(false)
    expect(() => fieldResponseNormalize(templates.f, grid(row("Lectura", "2"), row("Foro", "1"), row("Otro", "")), definition)).toThrow()
  })

  it("Coordinación agrega y quita filas también cuando editó el texto del campo", () => {
    const admin = intro("Texto de la plantilla", row("", ""))
    const more = save(admin, intro("Texto de la carrera", row("Lectura", "2"), row("Foro", "1")))
    expect(rowsOf(more)).toHaveLength(3)
    expect(rowsOf(read(admin, more))).toHaveLength(3)
    const less = save(admin, intro("Texto de la carrera", row("Lectura", "2")))
    expect(rowsOf(less)).toHaveLength(2)
  })

  it("nunca deja la tabla sin filas ni cambia columnas o encabezados", () => {
    const admin = intro("Texto de la plantilla", row("", ""))
    expect(() => save(admin, intro("Texto de la carrera"))).toThrow("tablas")
    expect(() => save(admin, intro("Texto de la carrera", row("Lectura")))).toThrow()
    expect(() => save(admin, intro("Texto de la carrera", row("a", "b"), head("c", "d")))).toThrow()
  })

  it("las tablas de filas fijas no admiten agregar ni quitar filas", () => {
    const admin: PhpRecord = { type: "doc", content: [line("Texto"), ...(fixed.content as PhpRecord[])] }
    const changed = (...rows: PhpRecord[]): PhpRecord => ({ type: "doc", content: [line("Otro texto"), ...(grid(...rows).content as PhpRecord[])] })
    expect(() => save(admin, changed(row("Teoría", ""), row("Práctica", ""), row("Más", "")))).toThrow("tablas")
    expect(() => save(admin, changed(row("Teoría", "")))).toThrow("tablas")
    expect(() => save(fixed, grid(row("Teoría", ""), row("Práctica", ""), row("", "")))).toThrow()
    expect(rowsOf(save(admin, changed(row("Teoría", "4"), row("Práctica", "2"))))).toHaveLength(3)
  })

  it("una fila nueva con respuesta conserva el espacio de la fila de la plantilla", () => {
    const answer = (): PhpRecord => ({ type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "response", attrs: { kind: "una", id: "modo", options: [{ const: "o1", title: "Aula" }], value: null } }] })
    const choosing = (): PhpRecord => ({ type: "tableRow", content: [{ type: "tableCell", content: [answer()] }, { type: "tableCell", content: [line("")] }] })
    const admin = intro("Texto de la plantilla", choosing())
    const saved = save(admin, intro("Texto de la carrera", choosing(), choosing()))
    expect(JSON.stringify(saved).match(/"id":"modo"/g)).toHaveLength(2)
  })
})

describe("«El docente puede editar este texto» en una tabla que admite filas", () => {
  const coordinator = () => save(list, editing(grid(row("Lectura", "2"))))
  const more = grid(row("Lectura", "5"), row("Foro", "1"), row("Taller", "3"))

  it("el docente cambia celdas y agrega o quita filas", () => {
    const own = fieldResponseNormalize(coordinator(), more, definition, "value", list)
    expect(hasOwnText(own)).toBe(true)
    expect(rowsOf(own)).toHaveLength(4)
    const base = save(list, editing(grid(row("Lectura", "2"), row("Foro", "1"))))
    expect(rowsOf(fieldResponseNormalize(base, grid(row("Foro", "1")), definition, "value", list))).toHaveLength(2)
  })

  it("al reconstruir sílabos conserva las filas del docente", () => {
    const own = fieldResponseNormalize(coordinator(), more, definition, "value", list)
    const next = save(list, editing(grid(row("Lectura nueva", "2"))))
    expect(teacherEdits(next)).toBe(true)
    expect(fieldFits(next, own, definition, list)).toBe(true)
    expect(rowsOf(fieldCarried(next, own, definition, list))).toEqual(rowsOf(own))
  })

  it("sigue sin poder quitar la última fila, tocar columnas ni encabezados", () => {
    expect(() => fieldResponseNormalize(coordinator(), grid(), definition, "value", list)).toThrow("tablas")
    expect(() => fieldResponseNormalize(coordinator(), grid(row("a")), definition, "value", list)).toThrow()
  })

  it("en una tabla de filas fijas no agrega ni quita filas", () => {
    const template = save(fixed, editing(fixed))
    expect(() => fieldResponseNormalize(template, grid(row("Teoría", ""), row("Práctica", ""), row("Más", "")), definition, "value", fixed)).toThrow("tablas")
    expect(() => fieldResponseNormalize(template, grid(row("Teoría", "")), definition, "value", fixed)).toThrow("tablas")
    expect(hasOwnText(fieldResponseNormalize(template, grid(row("Teoría", "4"), row("Práctica", "")), definition, "value", fixed))).toBe(true)
  })

  it("el docente recibe qué tablas admiten filas", () => {
    const payload = (admin: PhpRecord) =>
      (syllabusSectionPayload(
        { id: "s", key: "s", title: "S", orientation: "portrait", blocks: [{ id: "b", fields: [{ ...field, content: admin }] }] } as never,
        () => null,
        {},
        definition,
        { f: save(admin, editing(responseTemplate(clean(admin)))) },
      ).fields as PhpRecord[])[0]
    expect(payload(list).row_tables).toEqual([true])
    expect(payload(fixed)).not.toHaveProperty("row_tables")
  })
})
