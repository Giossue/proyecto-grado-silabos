// @vitest-environment node
import { describe, expect, it } from "vitest"
import { fieldLimitMessage } from "../configuration/fieldLimit"
import type { PhpRecord } from "../configuration/phpValues"
import { templateFields } from "../configuration/templatePresentation"
import { TemplateValidationError } from "../configuration/templateRuntime"
import { fieldId, goldenTemplate } from "../configuration/testing"
import { draftDocument, draftFieldLimit, draftLimitProblem, FIXED_BLOCKS } from "./draftField"

const template = goldenTemplate()
const definition = template.definition
const fieldOf = (index: number) => templateFields(template).find((field) => field.id === fieldId(index))!
const text = (value: string): PhpRecord => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: value }] }] })

describe("the rules a draft save applies to one field", () => {
  it("answer with the document the save stores", () => {
    expect(draftDocument(fieldOf(8), undefined, text("Clase invertida."), definition)).toEqual({
      type: "doc",
      content: [{ type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text: "Clase invertida." }] }],
    })
  })

  it("refuse a document that adds or drops a table the template defines", () => {
    let caught: unknown
    try {
      draftDocument(fieldOf(6), undefined, text("Sin la tabla de unidades"), definition)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(TemplateValidationError)
    expect(Object.values((caught as TemplateValidationError).errors).flat().length).toBeGreaterThan(0)
    expect(FIXED_BLOCKS).toBe("Los bloques de este campo los define la plantilla; el docente solo los responde.")
  })

  it("apply the character limit only when the text grows past it", () => {
    const limited = goldenTemplate()
    limited.definition.field_limits = { tecnicas_ensenanza: 5 }
    const field = templateFields(limited).find((candidate) => candidate.key === "tecnicas_ensenanza")!
    const limit = draftFieldLimit(field, undefined, limited.definition)
    const context = { template: limited, field, templates: {} }
    const long = draftDocument(field, undefined, text("Un texto largo"), limited.definition)
    const shorter = draftDocument(field, undefined, text("Un texto"), limited.definition)

    expect(limit).toBe(5)
    expect(draftLimitProblem(context, 5, new Map(), long)).toBe(fieldLimitMessage(5))
    expect(draftLimitProblem(context, 5, new Map([[field.id, long]]), shorter)).toBeNull()
    expect(draftFieldLimit({ ...field, responsible: "institucional" }, undefined, limited.definition)).toBeNull()
  })
})
