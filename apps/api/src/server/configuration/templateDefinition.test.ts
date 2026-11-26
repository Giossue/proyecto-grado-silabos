import { describe, expect, it } from "vitest"
import { DEFINITION_KEYS, defineTemplate, SOURCES } from "./templateDefinition"
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

  it("puts the campus, the corequisites and the teacher formation in the official template, after the subject card", () => {
    const identification = officialSections().find((section) => section.key === "identificacion")
    expect(identification?.fields.map((field) => [field.key, field.label, field.responsible])).toEqual([
      ["asignatura", "", "carrera"],
      ["nombre_campus", "Campus universitario", "carrera"],
      ["correquisitos_asignatura", "Correquisitos", "carrera"],
      ["formacion_docente", "Formación y experiencia académica-investigativa", "carrera"],
    ])
    expect(officialDefinition().teacher_fields).toEqual(["nombre_campus", "correquisitos_asignatura", "formacion_docente"])
  })

  it("feeds the campus and the corequisites of the card from what the teacher writes, not from the curriculum", () => {
    expect(SOURCES).not.toContain("identification.campus")
    expect(SOURCES).not.toContain("identification.corequisites")
    const variables = officialDefinition().variables
    expect(variables.nombre_campus?.source).toBe("identification.teacher_campus")
    expect(variables.correquisitos_asignatura?.source).toBe("identification.teacher_corequisites")
    expect(variables.formacion_docente?.source).toBe("identification.formation")
    const legacy = { variables: { nombre_campus: { label: "Campus", source: "identification.campus" } } }
    expect(errorsOf(() => defineTemplate(legacy, sections))).toEqual({ definition: ["variables.nombre_campus.source: use una de las fuentes del sistema (ver el manual técnico)."] })
  })
})
