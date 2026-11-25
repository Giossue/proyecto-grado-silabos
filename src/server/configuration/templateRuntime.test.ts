// @vitest-environment node
import { describe, expect, it } from "vitest"
import golden from "./__fixtures__/template-golden.json"
import { phpJsonEncode } from "../http/phpJson"
import { phpShape, type PhpRecord } from "./phpValues"
import {
  fieldDocumentIsEmpty,
  followTemplate,
  normalizeFieldDocument,
  openTemplate,
  pendingResponses,
  plainText,
  resolveDocument,
  responseTemplate,
  templateFor,
  TemplateValidationError,
  trustedDefinition,
  withoutOwnOptions,
  writable,
} from "./templateRuntime"
import { presentDefinition, variableCatalog } from "./templatePresentation"
import { profileTemplateOf } from "./subjectProfileFields"

const definition = trustedDefinition(golden.definition as unknown as PhpRecord)
const encode = (value: unknown) => phpJsonEncode(phpShape(value))

function attempt(work: () => unknown): unknown {
  try {
    return { ok: work() }
  } catch (error) {
    if (error instanceof TemplateValidationError) return { errors: error.errors }
    throw error
  }
}

describe("template runtime conformance with the Laravel classes", () => {
  it("presents the definition and the variable catalog byte for byte", () => {
    expect(encode(presentDefinition(definition))).toBe(golden.presentation)
    expect(encode(variableCatalog(definition))).toBe(golden.catalog)
  })

  it.each(golden.fields.map((field) => [field.key, field] as const))("normalizes, resolves and follows %s like PHP", (_, field) => {
    const normalized = normalizeFieldDocument(field.content, definition)
    const template = responseTemplate(normalized)
    const actual = {
      normalized: encode(normalized),
      template: encode(template),
      writable: encode(writable(field.content, definition)),
      open: encode(openTemplate(template)),
      pending: encode(pendingResponses(normalized)),
      plain: encode(plainText(normalized, definition)),
      resolved: encode(resolveDocument(normalized, golden.variables, definition)),
      template_for: encode(templateFor(field.content, field.stored, definition)),
      follow: encode(attempt(() => followTemplate(field.content, field.stored, definition))),
      template_of: encode(attempt(() => profileTemplateOf(field.content, field.stored, definition))),
      template_of_blank: encode(attempt(() => profileTemplateOf(field.content, null, definition))),
      without_own_options: encode(withoutOwnOptions(templateFor(field.content, field.stored, definition))),
    }
    expect(actual).toEqual(field.expected)
  })
})

describe("fieldDocumentIsEmpty", () => {
  const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })

  it("trims only the characters PHP's trim() removes", () => {
    expect(fieldDocumentIsEmpty(doc(" \t\n\r\0\u000b"), definition)).toBe(true)
    expect(fieldDocumentIsEmpty(doc("\u00a0"), definition)).toBe(false)
    expect(fieldDocumentIsEmpty(doc("\u2003\u3000\ufeff"), definition)).toBe(false)
    expect(fieldDocumentIsEmpty(doc("\u000c"), definition)).toBe(false)
  })

  it("treats a value that is not a document as empty", () => {
    expect(fieldDocumentIsEmpty("texto", definition)).toBe(true)
    expect(fieldDocumentIsEmpty(doc("Contenido"), definition)).toBe(false)
  })
})
