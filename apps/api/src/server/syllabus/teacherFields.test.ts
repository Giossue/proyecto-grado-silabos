import { describe, expect, it } from "vitest"
import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import { profileFields } from "../configuration/subjectProfileFields"
import { fakeTemplateStore, goldenTemplate, withFormation } from "../configuration/testing"
import { definitionHash } from "../ficha/definitionHash"
import { carryTeacherFields, FORMATION_FIELD, formationDocument, documentText, joinedDocuments, teacherFieldKeys } from "./teacherFields"

const SYLLABUS = "0195e7a0-0000-7000-8000-000000000001"
const EMPTY = { type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "left" } }] }

function paragraphs(...lines: string[]) {
  return { type: "doc", content: lines.map((line) => (line === "" ? { type: "paragraph" } : { type: "paragraph", content: [{ type: "text", text: line }] })) }
}

function recordingDb(reply: (query: Prisma.Sql) => unknown[] = () => []) {
  const queries: Prisma.Sql[] = []
  const record = (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
    const sql = query instanceof Prisma.Sql ? query : Prisma.sql(query, ...values)
    queries.push(sql)
    return sql
  }
  const db = {
    $queryRaw: async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => reply(record(query, ...values)),
    $executeRaw: async (query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => (record(query, ...values), 1),
  }
  return { db: db as unknown as Db, queries }
}

const text = (query: Prisma.Sql) => query.text.replace(/\s+/g, " ").trim()

describe("teacher fields of the template", () => {
  it("reads the field keys the template marks as filled by the teacher", () => {
    expect(teacherFieldKeys(withFormation().definition)).toEqual([FORMATION_FIELD])
    expect(teacherFieldKeys(goldenTemplate().definition)).toEqual([])
  })

  it("keeps the teacher fields out of the Coordination subject profile and its ficha", () => {
    const template = withFormation()
    const keys = profileFields({ template, definition: template.definition, store: fakeTemplateStore({ template, values: [] }) }).map((field) => field.key)
    expect(keys).not.toContain(FORMATION_FIELD)
    expect(keys.length).toBeGreaterThan(0)
  })

  it("turns the formation text into one paragraph per line and back", () => {
    const document = formationDocument("Ingeniera en Sistemas\n\nMagíster en Redes")
    expect(document).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text: "Ingeniera en Sistemas" }] },
        { type: "paragraph", attrs: { textAlign: "left" } },
        { type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text: "Magíster en Redes" }] },
      ],
    })
    expect(documentText(document)).toBe("Ingeniera en Sistemas\n\nMagíster en Redes")
    expect(documentText(EMPTY)).toBe("")
    expect(documentText(null)).toBe("")
  })

  it("joins the formations of several teachers one below the other without repeating them", () => {
    expect(joinedDocuments([paragraphs("Magíster"), paragraphs(" "), paragraphs("Magíster"), paragraphs("Doctor")])).toEqual(
      paragraphs("Magíster", "", "Doctor"),
    )
    expect(documentText(joinedDocuments([paragraphs("Magíster"), paragraphs("Doctor")]))).toBe("Magíster\n\nDoctor")
    expect(joinedDocuments([EMPTY])).toBeNull()
  })
})

describe("carry over of the teacher fields", () => {
  const huella = definitionHash(EMPTY)

  it("fills an empty teacher field with the last value each current teacher wrote in that same field, joined and fingerprinted", async () => {
    const { db, queries } = recordingDb((query) => {
      const sql = text(query)
      if (sql.startsWith("select valores_campo.valor_campo_id as id, valores_campo.valor_campo::text as value")) return [{ id: "v1", value: JSON.stringify(EMPTY) }]
      if (sql.includes("order by silabos.guardado_en desc")) {
        return query.values.includes("t1") ? [{ value: JSON.stringify(EMPTY) }, { value: JSON.stringify(paragraphs("Magíster")) }, { value: JSON.stringify(paragraphs("Viejo")) }] : [{ value: JSON.stringify(paragraphs("Doctor")) }]
      }
      if (sql.startsWith("select docentes_vigentes_silabo.usuario_id")) return [{ id: "t1" }, { id: "t2" }]
      if (sql.startsWith("select valores_campo.valor_campo_id as id from valores_campo")) return [{ id: "v1" }]
      return []
    })
    await carryTeacherFields(db, SYLLABUS, withFormation(), () => "new-id")
    const lookup = queries.map(text).find((sql) => sql.includes("order by silabos.guardado_en desc")) ?? ""
    expect(lookup).toContain("campos_plantilla.clave_campo_plantilla = $1")
    expect(lookup).toContain("valores_campo.huella_definicion_campo = $2")
    expect(lookup).toContain("silabos.silabo_id <> $3::uuid")
    const lookups = queries.filter((query) => text(query).includes("order by silabos.guardado_en desc"))
    expect(lookups.map((query) => query.values.slice(0, 3))).toEqual([
      [FORMATION_FIELD, huella, SYLLABUS],
      [FORMATION_FIELD, huella, SYLLABUS],
    ])
    const update = queries.find((query) => text(query).startsWith("update valores_campo"))
    expect(update && text(update)).toBe("update valores_campo set valor_campo = $1::jsonb, huella_definicion_campo = $2 where valores_campo.valor_campo_id = $3::uuid")
    expect(update?.values).toEqual([JSON.stringify(paragraphs("Magíster", "", "Doctor")), huella, "v1"])
  })

  it("keeps a teacher field that already has text and does nothing when the template has no teacher fields", async () => {
    const filled = recordingDb((query) => (text(query).startsWith("select valores_campo.valor_campo_id as id, valores_campo.valor_campo::text") ? [{ id: "v1", value: JSON.stringify(paragraphs("Propia")) }] : []))
    await carryTeacherFields(filled.db, SYLLABUS, withFormation(), () => "new-id")
    expect(filled.queries).toHaveLength(1)
    const none = recordingDb()
    await carryTeacherFields(none.db, SYLLABUS, goldenTemplate(), () => "new-id")
    expect(none.queries).toEqual([])
  })

  it("leaves the field as it is when no current teacher wrote it before", async () => {
    const { db, queries } = recordingDb((query) => (text(query).startsWith("select docentes_vigentes_silabo.usuario_id") ? [{ id: "t1" }] : []))
    await carryTeacherFields(db, SYLLABUS, withFormation(), () => "new-id")
    expect(queries.map(text).some((sql) => sql.startsWith("update") || sql.startsWith("insert"))).toBe(false)
  })
})
