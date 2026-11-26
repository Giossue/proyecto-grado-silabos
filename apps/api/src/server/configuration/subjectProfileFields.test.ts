// @vitest-environment node
import { describe, expect, it } from "vitest"
import { officialTemplate } from "../ai/testing"
import { profileComplete, profileFields, profileProgress, type ProfileContext } from "./subjectProfileFields"
import { fakeTemplateStore, goldenTemplate, writtenCareerFields } from "./testing"

const SUBJECT = "01a1c5bc-7cbf-7091-860c-63a02b91e998"
const paragraph = (...content: unknown[]) => (content.length ? { type: "paragraph", content } : { type: "paragraph" })
const doc = (...content: unknown[]) => ({ type: "doc", content })
const text = (value: string) => ({ type: "text", text: value })
const response = (kind: string, value: unknown, options: unknown[] = []) => ({ type: "response", attrs: { kind, options, value } })
const OPTIONS = [{ const: "o1", title: "Aula" }]

const contents = { vacio: doc(paragraph()), otro: doc(paragraph()), puesta: doc(paragraph(response("una", null, OPTIONS))) }
const id = (key: keyof typeof contents) => `01a1c5ba-9999-7000-8000-${String(Object.keys(contents).indexOf(key) + 1).padStart(12, "0")}`

const context = (stored: Partial<Record<keyof typeof contents, unknown>>): ProfileContext => {
  const golden = goldenTemplate()
  const fields = Object.entries(contents).map(([key, content]) => ({ id: id(key as keyof typeof contents), blockId: "b", key, label: key, responsible: "carrera", content }))
  const template = { ...golden, sections: [{ ...golden.sections[0]!, blocks: [{ id: "b", key: "prueba", title: "Prueba", position: 1, fields }] }] }
  const values = Object.entries(stored).map(([key, value]) => ({ fieldId: id(key as keyof typeof contents), subjectId: SUBJECT, value }))

  return { template, definition: template.definition, store: fakeTemplateStore({ template, values }) }
}
const progress = async (stored: Parameters<typeof context>[0]) => (await profileProgress(context(stored), [SUBJECT])).get(SUBJECT)

describe("avance del proyecto de carrera de una materia", () => {
  it("un campo vacío está pendiente y uno con una respuesta de Administración ya está definido", async () => {
    expect(await progress({})).toEqual({ filled: 1, total: 3 })
    expect((await profileComplete(context({}), [SUBJECT])).get(SUBJECT)).toBe(false)
  })

  it("dejar solo líneas o espacios en blanco no lo define", async () => {
    expect(await progress({ vacio: doc(paragraph(), paragraph()), otro: doc(paragraph(text("   "))) })).toEqual({ filled: 1, total: 3 })
  })

  it("se define con texto o con «Texto libre», y entonces el proyecto queda completo", async () => {
    const stored = { vacio: doc(paragraph(text("Apuntes"))), otro: doc(paragraph(response("texto", ""))) }
    expect(await progress(stored)).toEqual({ filled: 3, total: 3 })
    expect((await profileComplete(context(stored), [SUBJECT])).get(SUBJECT)).toBe(true)
  })

  it("una elección sigue pendiente hasta que tenga opciones", async () => {
    expect(await progress({ vacio: doc(paragraph(response("una", null))), otro: doc(paragraph(response("varias", [], OPTIONS))) })).toEqual({ filled: 2, total: 3 })
  })
})

// A field nobody can decide would keep the convocation closed for good.
describe("con la plantilla oficial, todo campo de Carrera se puede definir", () => {
  const template = officialTemplate()
  const official = (values: ReturnType<typeof writtenCareerFields>) => ({ template, definition: template.definition, store: fakeTemplateStore({ template, values }) })
  const pieces = [
    ["escribiendo", { type: "text", text: "Escrito" }],
    ["con «Texto libre»", { type: "response", attrs: { kind: "texto", options: [], value: "" } }],
  ] as const

  it.each(pieces)("%s en cada hueco", async (_, piece) => {
    const total = profileFields(official([])).length
    const before = (await profileProgress(official([]), [SUBJECT])).get(SUBJECT)!
    const after = (await profileProgress(official(writtenCareerFields(template, [SUBJECT], piece as never)), [SUBJECT])).get(SUBJECT)!
    console.log("OFFICIAL", total, "pending when untouched:", before.total - before.filled)

    expect(total).toBeGreaterThan(0)
    expect(before.filled).toBeLessThan(total)
    expect(after).toEqual({ filled: total, total })
  })
})
