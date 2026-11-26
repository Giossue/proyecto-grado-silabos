// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import golden from "./__fixtures__/laravel-documents-golden.json"
import { goldenTemplate, withFormation } from "../configuration/testing"
import { canonicalHash, canonicalJson } from "./canonicalJson"
import type { ArchivedField } from "../syllabus/syllabusDetailQueries"
import { buildSyllabusSnapshot, SNAPSHOT_VERSION, visibleSections, type SnapshotSource } from "./syllabusSnapshot"

const SYLLABUS = "50000000-0000-4000-8000-000000000001"
const FACULTY = "f0000000-0000-4000-8000-000000000001"

let root: string
let archived: ArchivedField[] | null
let values: Map<string, unknown>

const source = (): SnapshotSource => ({
  template: async () => goldenTemplate(),
  values: async () => values,
  identification: async () => ({
    context: { career: { name: "Software", faculty: "Ciencias", faculty_id: FACULTY }, subject: { name: "Biología", code: "C2" } },
    parallelCode: "A",
    parallelShift: "matutina",
    teachers: [{ name: "Ana Pérez", email: "ana@ueb.edu.ec" }],
    formation: "Magíster",
  }),
  archivedFields: async () => archived,
  logos: { faculty: async () => null },
})

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "silabos-snapshot-"))
  process.env.STORAGE_PATH = path.join(root, "storage", "app")
  process.env.PUBLIC_ASSETS_PATH = path.join(root, "public")
  await mkdir(path.join(root, "public", "images", "silabo"), { recursive: true })
  await writeFile(path.join(root, "public", "images", "silabo", "logo-universidad.png"), "universidad")
  await writeFile(path.join(root, "public", "images", "silabo", "facultad.jpeg"), "facultad")
})

afterAll(async () => {
  delete process.env.STORAGE_PATH
  delete process.env.PUBLIC_ASSETS_PATH
  await rm(root, { recursive: true, force: true })
})

beforeEach(() => {
  archived = null
  values = new Map()
})

describe("canonical JSON (CanonicalHasher)", () => {
  it.each(golden.canonical.map((item, index) => [index, item] as const))("case %i matches Laravel byte for byte", (_index, item) => {
    expect(canonicalJson(item.value)).toBe(item.json)
    expect(canonicalHash(item.value)).toBe(item.hash)
  })
})

describe("SyllabusConditions::visibleSections", () => {
  it.each(golden.visible_sections.map((item, index) => [index, item] as const))("case %i matches Laravel", (_index, item) => {
    const result = visibleSections(item.sections as never, item.conditions as never)
    expect(canonicalJson(result)).toBe(canonicalJson(item.expected))
  })
})

describe("SyllabusSnapshot::build", () => {
  it("shows the teacher formation in the identification card and does not draw its field again as a block", async () => {
    const snapshot = await buildSyllabusSnapshot(SYLLABUS, { ...source(), template: async () => withFormation() })
    expect((snapshot.identification as Record<string, string>).formation).toBe("Magíster")
    const sections = snapshot.sections as { key: string; fields: { key: string }[] }[]
    expect(sections.flatMap((section) => section.fields.map((field) => field.key))).not.toContain("formacion_docente")
    expect(sections.map((section) => section.key)).toEqual(goldenTemplate().sections.map((section) => section.key))
  })

  it("builds the version 9 snapshot with embedded logos, identification, variables and resolved fields", async () => {
    const snapshot = await buildSyllabusSnapshot(SYLLABUS, source())
    const template = goldenTemplate()
    expect(snapshot.schema_version).toBe(SNAPSHOT_VERSION)
    expect(snapshot.template_id).toBe(template.id)
    expect(snapshot.template_name).toBe("Plantilla institucional de sílabo")
    expect(snapshot.template_definition).toEqual(template.definition)
    expect(snapshot.logos).toEqual({ institution: Buffer.from("universidad").toString("base64"), faculty: Buffer.from("facultad").toString("base64") })
    expect((snapshot.identification as Record<string, string>).shift).toBe("Matutina")
    const sections = snapshot.sections as { key: string; fields: { definition_id: string; document: unknown; value: unknown }[] }[]
    expect(sections.map((section) => section.key)).toEqual(template.sections.map((section) => section.key))
    for (const field of sections.flatMap((section) => section.fields)) expect(field.value).toBeTypeOf("object")
  })

  it("uses the stored answer of a career field and the template content of an institutional one", async () => {
    const template = goldenTemplate()
    const fields = template.sections.flatMap((section) => section.blocks.flatMap((block) => block.fields))
    const career = fields.find((field) => field.responsible !== "institucional")!
    const answer = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Respuesta guardada" }] }] }
    values = new Map([[career.id, answer]])
    const snapshot = await buildSyllabusSnapshot(SYLLABUS, source())
    const stored = (snapshot.sections as { fields: { definition_id: string; document: unknown }[] }[]).flatMap((section) => section.fields).find((field) => field.definition_id === career.id)
    expect(JSON.stringify(stored?.document)).toContain("Respuesta guardada")
  })

  it("freezes the sections of the retired fields a syllabus still answers, like SyllabusDocumentFields::archivedSections", async () => {
    const answer = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Respuesta archivada" }] }] }
    archived = [
      { sectionId: "s-2", sectionKey: "anterior", sectionTitle: "Sección retirada", sectionOrientation: "landscape", id: "f-2", key: "metodos", label: "Métodos", responsible: "docente", content: answer },
      { sectionId: "s-1", sectionKey: "datos", sectionTitle: "Datos", sectionOrientation: "portrait", id: "f-1", key: "tema", label: "Tema", responsible: "docente", content: { type: "doc", content: [{ type: "paragraph" }] } },
    ]
    const snapshot = await buildSyllabusSnapshot(SYLLABUS, source())
    const sections = snapshot.sections as { key: string; orientation: string; fields: { definition_id: string; label: string; value: unknown }[] }[]
    expect(sections.map((section) => [section.key, section.orientation, section.fields.map((field) => field.definition_id)])).toEqual([
      ["anterior", "landscape", ["f-2"]],
      ["datos", "portrait", ["f-1"]],
    ])
    expect(JSON.stringify(sections[0].fields[0].value)).toContain("Respuesta archivada")
  })

  it("answers Laravel's model 404 when the institutional template does not exist", async () => {
    const response = await buildSyllabusSnapshot(SYLLABUS, { ...source(), template: async () => null }).catch((error: { response: Response }) => error.response)
    expect((response as Response).status).toBe(404)
    expect(await (response as Response).json()).toEqual({ message: "No query results for model [App\\Modules\\Configuration\\Infrastructure\\Persistence\\Models\\SyllabusTemplate]." })
  })
})
