import { describe, expect, it } from "vitest"
import type { Prisma } from "../../generated/prisma/client"
import { fakeDb } from "./testing"
import { createTemplateStore, loadTemplate } from "./templateStore"

const TEMPLATE = "0195e7a0-0000-7000-8000-0000000000aa"

function templateRows(query: Prisma.Sql): unknown[] {
  if (query.text.includes("from plantilla_silabo")) return [{ id: TEMPLATE, modifiedAt: "2026-11-25 20:15:00+00", definition: "{}" }]
  if (query.text.includes("from secciones_plantilla")) {
    return [
      { id: "s1", clave: "datos", titulo: "Datos", orientacion: null, posicion: 1 },
      { id: "s2", clave: "plan", titulo: "Plan", orientacion: "landscape", posicion: 2 },
    ]
  }
  if (query.text.includes("from campos_plantilla")) return [{ id: "b1", section_id: "s1", clave: "nombre", titulo: "Nombre", posicion: 3 }]
  if (query.text.includes("from definiciones_campo")) {
    return [
      { id: "f1", block_id: "b1", quien_llena: "docente", contenido: '{"type":"text"}', clave: "nombre", titulo: "Nombre" },
      { id: "f2", block_id: "b1", quien_llena: "carrera", contenido: null, clave: null, titulo: null },
    ]
  }
  return []
}

describe("loadTemplate", () => {
  it("builds sections, blocks and fields in the stored order", async () => {
    const { db, queries } = fakeDb(templateRows)
    const template = await loadTemplate(db)
    expect(template?.id).toBe(TEMPLATE)
    expect(template?.modifiedAt).toBe("2026-11-25 20:15:00+00")
    expect(template?.sections.map((section) => [section.key, section.orientation, section.position])).toEqual([
      ["datos", "portrait", 1],
      ["plan", "landscape", 2],
    ])
    expect(template?.sections[0].blocks).toEqual([
      {
        id: "b1",
        key: "nombre",
        title: "Nombre",
        position: 3,
        fields: [
          { id: "f1", blockId: "b1", key: "nombre", label: "Nombre", responsible: "docente", content: { type: "text" } },
          { id: "f2", blockId: "b1", key: "", label: "", responsible: "carrera", content: null },
        ],
      },
    ])
    expect(queries[0].text).not.toMatch(/for update/)
    expect(queries[1].text).toMatch(/order by posicion_seccion_plantilla asc, clave_seccion_plantilla asc$/)
    expect(queries[2].text).toMatch(/order by posicion_campo_plantilla asc, clave_campo_plantilla asc$/)
  })

  it("locks the template row when asked", async () => {
    const { db, queries } = fakeDb(templateRows)
    await loadTemplate(db, true)
    expect(queries[0].text).toMatch(/limit 1 for update$/)
  })

  it("returns null without a template", async () => {
    expect(await loadTemplate(fakeDb(() => []).db)).toBeNull()
  })
})

describe("createTemplateStore", () => {
  it("decodes stored values", async () => {
    const { db, queries } = fakeDb(() => [{ fieldId: "f1", subjectId: "a1", value: '["x"]' }])
    expect(await createTemplateStore(db).subjectValues("a1")).toEqual([{ fieldId: "f1", subjectId: "a1", value: ["x"] }])
    expect(queries[0].values).toEqual(["a1"])
  })

  it("skips the query for empty lists", async () => {
    const { db, queries } = fakeDb(() => [])
    const store = createTemplateStore(db)
    expect(await store.valuesForSubjects([], ["f1"])).toEqual([])
    expect(await store.valuesForSubjects(["a1"], [])).toEqual([])
    expect(await store.liveFields([], false)).toEqual([])
    expect(queries).toEqual([])
  })

  it("reads live fields once per id and can leave out institutional ones", async () => {
    const { db, queries } = fakeDb(() => [{ id: "f1", responsible: "carrera", content: "[]" }])
    const store = createTemplateStore(db)
    expect(await store.liveFields(["f1", "f1"], true)).toEqual([{ id: "f1", responsible: "carrera", content: [] }])
    expect(queries[0].values).toEqual([["f1"]])
    expect(queries[0].text).toMatch(/and quien_llena_definicion_campo <> 'institucional'$/)
    await store.liveFields(["f1"], false)
    expect(queries[1].text).not.toMatch(/institucional/)
  })
})
