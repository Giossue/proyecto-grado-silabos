// @vitest-environment node
import { z } from "zod"
import { describe, expect, it } from "vitest"
import { checkItems, field, is, itemsAt, nullableField, requiredField, sometimesField } from "./fields"
import { schemaErrors } from "./issues"

describe("field", () => {
  it("skips database presence checks once the value already failed", async () => {
    const queried: unknown[] = []
    const schema = z.object({
      period: nullableField("período", [is.uuid(), is.existing(async (value) => (queried.push(value), false))]),
      code: field("code", [is.min(3), is.unique(async (value) => (queried.push(value), false))]),
    })
    expect(await schemaErrors(schema, { period: "abc", code: "x" })).toEqual({ period: ["El campo período debe ser un UUID válido."], code: ["El campo code debe tener al menos 3 caracteres."] })
    expect(queried).toEqual([])
  })

  it("tells required, present, sometimes and nullable apart", async () => {
    const schema = z.object({
      required: requiredField("obligatorio", [is.string()]),
      present: field("presente", [is.array()], { present: true, nullable: true }),
      sometimes: sometimesField("a veces", [is.boolean()]),
      nullable: nullableField("vacío", [is.integer()]),
    })
    expect(await schemaErrors(schema, {})).toEqual({ required: ["El campo obligatorio es obligatorio."], present: ["El campo presente debe estar presente."] })
    expect(await schemaErrors(schema, { required: " ", present: null, sometimes: null, nullable: null })).toEqual({
      required: ["El campo obligatorio es obligatorio."],
      sometimes: ["El campo a veces debe ser verdadero o falso."],
    })
  })

  it("measures sizes as numbers, lists or characters depending on the declared type", async () => {
    const schema = z.object({
      timeout: requiredField("timeout", [is.integer(), is.between(5, 300)]),
      tags: requiredField("etiquetas", [is.array(), is.max(1)]),
      name: requiredField("nombre", [is.string(), is.max(2)]),
    })
    expect(await schemaErrors(schema, { timeout: "4", tags: { 0: "a", 1: "b" }, name: "ñan" })).toEqual({
      timeout: ["El campo timeout debe estar entre 5 y 300."],
      tags: ["El campo etiquetas no debe tener más de 1 elementos."],
      name: ["El campo nombre no debe tener más de 2 caracteres."],
    })
    expect(await schemaErrors(schema, { timeout: "300", tags: {}, name: "ña" })).toEqual({ tags: ["El campo etiquetas es obligatorio."] })
  })

  it("checks URL protocols and dates", async () => {
    const schema = z.object({ url: nullableField("base url", [is.string(), is.url(["https"])]), due: requiredField("fecha", [is.date()]) })
    expect(await schemaErrors(schema, { url: "http://x.ec", due: "2026-02-30" })).toEqual({ url: ["El campo base url debe ser una URL válida."], due: ["El campo fecha debe ser una fecha válida."] })
    expect(await schemaErrors(schema, { url: "https://x.ec", due: "2026-02-28" })).toEqual({})
  })
})

describe("checkItems", () => {
  const schema = z.object({ codes: requiredField("códigos", [is.array()]) }).superRefine(async (input, context) => {
    await checkItems(context, itemsAt(input.codes, ["codes"]), "código", [is.string(), is.distinct()], { required: true })
  })

  it("reports each item under its own path, after the top-level fields, and finds loosely equal duplicates", async () => {
    expect(await schemaErrors(schema, { codes: ["A", "1", 1, ""] })).toEqual({
      "codes.1": ["El campo código tiene un valor duplicado."],
      "codes.2": ["El campo código debe ser una cadena de texto.", "El campo código tiene un valor duplicado."],
      "codes.3": ["El campo código es obligatorio."],
    })
  })

  it("ignores items when the list is not a list", async () => {
    expect(await schemaErrors(schema, { codes: "A" })).toEqual({ codes: ["El campo códigos debe ser una lista."] })
  })
})
