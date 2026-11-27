// @vitest-environment node
import { describe, expect, it } from "vitest"
import { schemaErrors } from "./issues"
import { subjectProfileBulkSchema, subjectProfileValuesSchema } from "./imports"

describe("import schemas", () => {
  it("validate which subjects a field fills", async () => {
    expect(await schemaErrors(subjectProfileBulkSchema, { field_id: "abc", value: null, subjects: ["x", "x"] })).toEqual({
      field_id: ["El campo campo debe ser un UUID válido."],
      "subjects.0": ["El campo materia debe ser un UUID válido.", "El campo materia tiene un valor duplicado."],
      "subjects.1": ["El campo materia debe ser un UUID válido.", "El campo materia tiene un valor duplicado."],
    })
  })

  it("validate the career project values", async () => {
    expect(await schemaErrors(subjectProfileValuesSchema, {})).toEqual({ values: ["El campo datos del proyecto de carrera debe estar presente."] })
    expect(await schemaErrors(subjectProfileValuesSchema, { values: { a: null, b: "x" } })).toEqual({ "values.b": ["El campo dato del proyecto de carrera debe ser una lista."] })
  })

})
