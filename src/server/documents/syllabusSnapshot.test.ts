// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import golden from "./__fixtures__/laravel-documents-golden.json"
import { goldenTemplate } from "../configuration/testing"
import { NeedsLaravel } from "../syllabus/snapshotDocuments"
import { canonicalHash, canonicalJson, hasAmbiguousNumbers } from "./canonicalJson"
import { buildSyllabusSnapshot, SNAPSHOT_VERSION, visibleSections, type SnapshotRawJson, type SnapshotSource } from "./syllabusSnapshot"

const SYLLABUS = "50000000-0000-4000-8000-000000000001"
const FACULTY = "f0000000-0000-4000-8000-000000000001"

let root: string
let raw: SnapshotRawJson
let archived: boolean
let values: Map<string, unknown>

const source = (): SnapshotSource => ({
  template: async () => goldenTemplate(),
  values: async () => values,
  identification: async () => ({
    context: { career: { name: "Software", faculty: "Ciencias", faculty_id: FACULTY }, subject: { name: "Biología", code: "C2" } },
    parallelCode: "A",
    parallelShift: "matutina",
    teachers: [{ name: "Ana Pérez", email: "ana@ueb.edu.ec", formation: "Magíster" }],
  }),
  hasArchivedValues: async () => archived,
  rawJson: async () => raw,
  logos: { faculty: async () => null },
})

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "silabos-snapshot-"))
  process.env.LARAVEL_STORAGE_PATH = path.join(root, "storage", "app")
  process.env.LARAVEL_PUBLIC_PATH = path.join(root, "public")
  await mkdir(path.join(root, "public", "images", "silabo"), { recursive: true })
  await writeFile(path.join(root, "public", "images", "silabo", "logo-universidad.png"), "universidad")
  await writeFile(path.join(root, "public", "images", "silabo", "facultad.jpeg"), "facultad")
})

afterAll(async () => {
  delete process.env.LARAVEL_STORAGE_PATH
  delete process.env.LARAVEL_PUBLIC_PATH
  await rm(root, { recursive: true, force: true })
})

beforeEach(() => {
  raw = { definition: '{"document":{"line_height":1.15}}', context: '{"career":{"credits":3}}', values: [], contents: [] }
  archived = false
  values = new Map()
})

describe("canonical JSON (CanonicalHasher)", () => {
  it.each(golden.canonical.map((item, index) => [index, item] as const))("case %i matches Laravel byte for byte", (_index, item) => {
    expect(canonicalJson(item.value)).toBe(item.json)
    expect(canonicalHash(item.value)).toBe(item.hash)
  })

  it("flags float literals that JavaScript cannot tell apart from integers", () => {
    expect(hasAmbiguousNumbers('{"a":1.5,"b":"10.0","c":[2]}')).toBe(false)
    expect(hasAmbiguousNumbers('{"a":10.0}')).toBe(true)
    expect(hasAmbiguousNumbers('{"a":1e5}')).toBe(true)
    expect(hasAmbiguousNumbers('{"a":12345678901234567890}')).toBe(true)
  })
})

describe("SyllabusConditions::visibleSections", () => {
  it.each(golden.visible_sections.map((item, index) => [index, item] as const))("case %i matches Laravel", (_index, item) => {
    const result = visibleSections(item.sections as never, item.conditions as never)
    expect(canonicalJson(result)).toBe(canonicalJson(item.expected))
  })
})

describe("SyllabusSnapshot::build", () => {
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

  it("leaves to Laravel a syllabus with answers of retired fields or float literals it cannot reproduce", async () => {
    archived = true
    await expect(buildSyllabusSnapshot(SYLLABUS, source())).rejects.toBeInstanceOf(NeedsLaravel)
    archived = false
    raw = { ...raw, values: ['{"type":"doc","hours":2.0}'] }
    await expect(buildSyllabusSnapshot(SYLLABUS, source())).rejects.toBeInstanceOf(NeedsLaravel)
  })
})
