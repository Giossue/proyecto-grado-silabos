// @vitest-environment node
import { describe, expect, it } from "vitest"
import golden from "./__fixtures__/laravel-text-pdf-golden.json"
import wordGolden from "./__fixtures__/laravel-word-golden.json"
import type { PhpRecord } from "../configuration/phpValues"
import { plainTextPdf, syllabusLines } from "./plainTextPdf"
import type { DocumentRenderInput } from "./syllabusRenderer"

function replaceRecursive(base: PhpRecord, replacement: PhpRecord): PhpRecord {
  const merged: PhpRecord = { ...base }
  for (const [key, value] of Object.entries(replacement)) {
    const current = merged[key]
    merged[key] =
      value !== null && typeof value === "object" && !Array.isArray(value) && current !== null && typeof current === "object" && !Array.isArray(current)
        ? replaceRecursive(current as PhpRecord, value as PhpRecord)
        : value
  }
  return merged
}

function inputOf(name: string): DocumentRenderInput {
  const testCase = (wordGolden.cases as { name: string; document: PhpRecord; snapshot: PhpRecord }[]).find((candidate) => candidate.name === name)
  const overrides = testCase?.document ?? {}
  const document = replaceRecursive(wordGolden.definition.document as PhpRecord, overrides)
  if ("header" in overrides) document.header = overrides.header
  const snapshot = name === "bloques" ? (golden.cases.find((candidate) => candidate.name === "bloques") as unknown as { snapshot: PhpRecord }).snapshot : (testCase?.snapshot ?? {})
  return {
    subject: "Biología",
    subjectCode: "C2",
    academicPeriod: "2026-2",
    revisionNumber: 2,
    revisionFingerprint: "ab".repeat(32),
    generatedAt: "2026-11-24T15:30:00+00:00",
    locale: "es-EC",
    snapshot: { ...snapshot, template_definition: { ...wordGolden.definition, document }, template_variables: wordGolden.template_variables },
  }
}

describe("PlainTextPdf", () => {
  it.each(golden.raw.map((sample, index) => [index, sample] as const))("writes the same bytes as Laravel for raw case %i", (_, sample) => {
    expect(plainTextPdf(sample.lines).toString("base64")).toBe(sample.pdf)
  })
})

describe("SyllabusDocumentContent::lines", () => {
  it.each(golden.cases.map((sample) => [sample.name, sample] as const))("%s: lines and PDF match Laravel", (name, sample) => {
    const lines = syllabusLines(inputOf(name))
    expect(lines).toEqual(sample.lines)
    expect(plainTextPdf(lines).toString("base64")).toBe(sample.pdf)
  })

  it("reads snapshots without a frozen template with the official template, like TemplateContext::fromSnapshot", () => {
    const lines = syllabusLines({ ...inputOf("plantilla"), snapshot: { sections: [] } })
    expect(lines[0]).not.toBe("")
    expect(lines.slice(1, 4)).toEqual(syllabusLines(inputOf("plantilla")).slice(1, 4))
  })

  it("prints legacy fields and blocks like SyllabusDocumentContent, with PHP's float and nested value formats", () => {
    const snapshot = {
      sections: [
        {
          title: "Unidades",
          fields: [{ label: "Tabla", type: "tabla", config: { columns: [{ key: "h", label: "Horas" }], rows: [{ key: "u1", label: "Unidad 1" }] }, value: { u1: { h: 2 } } }],
          blocks: [
            { title: "Bloque", document: { type: "doc", content: [{ type: "paragraph", content: [{ type: "field", attrs: { key: "tema" } }] }] }, fields: [{ key: "tema", value: "Células" }] },
            { title: "Datos", fields: [{ label: "Créditos", value: 0.1 + 0.2 }, { label: "Lista", value: { horas: 4.5, detalle: { a: 1 } } }] },
          ],
        },
      ],
    }
    const lines = syllabusLines({ ...inputOf("plantilla"), snapshot })
    expect(lines.slice(4)).toEqual(["Unidades", "Tabla:  | Horas\nUnidad 1 | 2", "  Bloque", "Células", "  Datos", "    Créditos: 0.3", '    Lista: horas: 4.5 · detalle: {"a":1}', ""])
  })
})
