// @vitest-environment node
import { describe, expect, it } from "vitest"
import { schemaErrors } from "./issues"
import { fichaApplySchema, subjectProfileValuesSchema } from "./imports"

describe("import schemas", () => {
  it("validate the confirmed ficha selection", async () => {
    expect(await schemaErrors(fichaApplySchema, { fingerprint: "abc", file_hash: "f".repeat(64), subjects: ["x"], fields: { a: "x", b: ["y".repeat(101)] } })).toEqual({
      fingerprint: ["El campo estructura de la plantilla debe tener 64 caracteres.", "El formato del campo estructura de la plantilla no es válido."],
      "subjects.0": ["El campo materia debe ser un UUID válido."],
      "fields.a": ["El campo campos de la materia debe ser una lista."],
      "fields.b.0": ["El campo campo no debe tener más de 100 caracteres."],
    })
  })

  it("validate the career project values", async () => {
    expect(await schemaErrors(subjectProfileValuesSchema, {})).toEqual({ values: ["El campo datos del proyecto de carrera debe estar presente."] })
    expect(await schemaErrors(subjectProfileValuesSchema, { values: { a: null, b: "x" } })).toEqual({ "values.b": ["El campo dato del proyecto de carrera debe ser una lista."] })
  })

})
