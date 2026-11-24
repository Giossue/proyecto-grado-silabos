// @vitest-environment node
import { describe, expect, it } from "vitest"
import golden from "./__fixtures__/laravel-text-pdf-golden.json"
import wordGolden from "./__fixtures__/laravel-word-golden.json"
import type { PhpRecord } from "../configuration/phpValues"
import { NeedsLaravel } from "../syllabus/snapshotDocuments"
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

  it("leaves snapshots without a template definition to Laravel", () => {
    expect(() => syllabusLines({ ...inputOf("plantilla"), snapshot: { sections: [] } })).toThrow(NeedsLaravel)
  })
})
