import { describe, expect, it } from "vitest"
import { DEFINITION_KEYS, defineTemplate } from "./templateDefinition"
import { officialDefinition, officialSections } from "./officialTemplate"
import { TemplateValidationError } from "./templateRuntime"

const sections = [
  { key: "identificacion", fields: [{ key: "asignatura", quien_llena: "carrera", content: { type: "doc", content: [{ type: "paragraph" }] } }] },
  { key: "identificacion", fields: [{ key: "formacion_docente", quien_llena: "carrera", content: { type: "doc", content: [{ type: "paragraph" }] } }] },
]

function errorsOf(work: () => unknown): unknown {
  try {
    work()
  } catch (error) {
    if (error instanceof TemplateValidationError) return error.errors
    throw error
  }
  return null
}

describe("teacher fields in the template definition", () => {
  it("accepts the list of fields the teacher fills and keeps it in the definition", () => {
    expect(DEFINITION_KEYS).toContain("teacher_fields")
    expect(defineTemplate({ teacher_fields: ["formacion_docente", "formacion_docente"] }, sections).teacher_fields).toEqual(["formacion_docente"])
    expect(defineTemplate({}, sections).teacher_fields).toEqual([])
  })

  it("rejects a teacher field that is not a field of the template", () => {
    expect(errorsOf(() => defineTemplate({ teacher_fields: ["otro"] }, sections))).toEqual({ definition: ["teacher_fields: «otro» no es un campo de la plantilla."] })
    expect(errorsOf(() => defineTemplate({ teacher_fields: "formacion_docente" }, sections))).toEqual({ definition: ["«teacher_fields» debe ser una lista de claves de campo."] })
  })

  it("puts the teacher formation in the official template, after the subject card", () => {
    const identification = officialSections().find((section) => section.key === "identificacion")
    expect(identification?.fields.map((field) => [field.key, field.label, field.responsible])).toEqual([
      ["asignatura", "", "carrera"],
      ["formacion_docente", "Formación y experiencia académica-investigativa", "carrera"],
    ])
    expect(officialDefinition().teacher_fields).toEqual(["formacion_docente"])
  })
})
