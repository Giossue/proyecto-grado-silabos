// @vitest-environment node
import { describe, expect, it } from "vitest"
import { schemaErrors } from "./issues"
import { catalogSearchSchema, libraryCommentSchema, libraryReviewFiltersSchema } from "./library"

describe("libraryCommentSchema", () => {
  it("asks for at least one known reason and for the other reason when it is chosen", async () => {
    expect(await schemaErrors(libraryCommentSchema, {})).toEqual({ reasons: ["Elija al menos un motivo."] })
    expect(await schemaErrors(libraryCommentSchema, { reasons: ["otro", "x", "otro"] })).toEqual({
      other: ["Escriba el otro motivo."],
      "reasons.0": ["El campo motivo tiene un valor duplicado."],
      "reasons.1": ["El motivo elegido no es válido."],
      "reasons.2": ["El campo motivo tiene un valor duplicado."],
    })
    expect(await schemaErrors(libraryCommentSchema, { reasons: ["otro"], other: "abc" })).toEqual({ other: ["Escriba el otro motivo con al menos 5 caracteres."] })
    expect(await schemaErrors(libraryCommentSchema, { reasons: ["isbn_incorrecto"] })).toEqual({})
  })
})

describe("library listings", () => {
  it("validate filters and only query existence for well-formed identifiers", async () => {
    const asked: string[] = []
    const schema = libraryReviewFiltersSchema((table) => async () => (asked.push(table), false))
    expect(await schemaErrors(schema, { state: "otro", faculty: "x", period: "01a1c5ba-2222-7000-8000-999999999999", mine: "sí" })).toEqual({
      state: ["El valor seleccionado en estado no es válido."],
      faculty: ["El campo facultad debe ser un UUID válido."],
      period: ["El valor seleccionado en período no es válido."],
      mine: ["El campo solo los míos debe ser verdadero o falso."],
    })
    expect(asked).toEqual(["periodos_academicos"])
  })

  it("validate the catalog search", async () => {
    expect(await schemaErrors(catalogSearchSchema(["title"], 120), { field: "isbn", q: "a", page: "0" })).toEqual({
      field: ["El valor seleccionado en campo de búsqueda no es válido."],
      q: ["El campo texto a buscar debe tener al menos 2 caracteres."],
      page: ["El campo página debe ser al menos 1."],
    })
  })
})
