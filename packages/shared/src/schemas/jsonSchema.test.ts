import { describe, expect, it } from "vitest"
import { z } from "zod"
import { libraryCommentSchema } from "./library"
import { messages } from "./messages"
import { passwordConfirmation } from "./password"
import { careerField } from "./people"
import { nullableChoice, nullableInteger, nullableText, requiredValue } from "./rules"

const SCHEMAS: [string, z.ZodType][] = [
  ["requiredValue", requiredValue("Requerido.")],
  ["nullableText", nullableText("nombre", { max: 5 })],
  ["nullableChoice", nullableChoice("estado", ["a", "b"])],
  ["nullableInteger", nullableInteger("orden", { min: 1 })],
  ["passwordConfirmation", passwordConfirmation],
  ["careerField", careerField({ required: true, requiredMessage: "Elija la carrera." })],
  ["libraryCommentSchema", libraryCommentSchema],
]

describe("shared rules in JSON Schema", () => {
  it.each(SCHEMAS)("%s can be described for the OpenAPI document", (_, schema) => {
    for (const io of ["input", "output"] as const) expect(() => z.toJSONSchema(schema, { io })).not.toThrow()
  })

  it("keeps the same answers for any value", async () => {
    expect((await requiredValue("Requerido.").safeParseAsync(" ")).error?.issues.map((issue) => issue.message)).toEqual(["Requerido."])
    expect((await nullableText("nombre", { max: 2 }).safeParseAsync(5)).error?.issues.map((issue) => issue.message)).toEqual([messages.string("nombre")])
    expect((await z.object({ value: nullableInteger("orden") }).safeParseAsync({})).data).toEqual({})
  })
})
