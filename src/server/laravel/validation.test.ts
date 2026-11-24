// @vitest-environment node
import { describe, expect, it } from "vitest"
import { validateInput } from "./validation"

describe("validateInput", () => {
  it("skips database presence rules once the attribute already failed, like Laravel", async () => {
    const queried: unknown[] = []
    const errors = await validateInput(
      { period: "abc", code: "x" },
      {
        period: ["nullable", "uuid", { exists: async (value) => (queried.push(value), false) }],
        code: [{ min: 3 }, { unique: async (value) => (queried.push(value), false) }],
      },
      { period: "período" },
    )
    expect(queried).toEqual([])
    expect(errors).toEqual({ period: ["El campo período debe ser un UUID válido."], code: ["El campo code debe tener al menos 3 caracteres."] })
  })
})
