import { describe, expect, it } from "vitest"
import { z } from "zod"
import { schemaResolver } from "@/lib/forms"

const schema = z.object({ name: z.string().min(1, "Escriba el nombre.") })
const resolve = (keepPeriods?: boolean) =>
  schemaResolver(schema, keepPeriods === undefined ? undefined : { keepPeriods })({ name: "" }, undefined, { fields: {}, shouldUseNativeValidation: false, criteriaMode: "all" })

describe("schemaResolver", () => {
  it("drops the final period of the messages by default", async () => {
    expect((await resolve()).errors.name?.message).toBe("Escriba el nombre")
  })

  it("keeps the final period when the form asks for it", async () => {
    const { errors } = await resolve(true)
    expect(errors.name?.message).toBe("Escriba el nombre.")
    expect(Object.values(errors.name?.types ?? {}).flat()).toEqual(["Escriba el nombre."])
  })
})
