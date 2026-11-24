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

describe("dependent, range and URL rules", () => {
  const rules = {
    driver: ["required" as const],
    base_url: ["nullable" as const, { required_unless: ["driver", "disabled"] }, "string" as const, { url: ["https"] }],
    koha_url: ["nullable" as const, { required_if: ["driver", "koha"] }],
    timeout: ["required" as const, "integer" as const, { between: [5, 300] as [number, number] }],
  }

  it("requires a value unless or when another field holds one of the given values", async () => {
    expect(await validateInput({ driver: "deepseek", timeout: 5 }, rules)).toEqual({
      base_url: ["El campo base url es obligatorio a menos que driver esté en disabled."],
    })
    expect(await validateInput({ driver: "koha", timeout: 5 }, rules)).toEqual({
      base_url: ["El campo base url es obligatorio a menos que driver esté en disabled."],
      koha_url: ["El campo koha url es obligatorio cuando driver sea koha."],
    })
    expect(await validateInput({ driver: "disabled", base_url: null, timeout: 5 }, rules)).toEqual({})
  })

  it("checks the size range and the URL protocols", async () => {
    expect(await validateInput({ driver: "disabled", base_url: "http://x.ec", timeout: 4 }, rules)).toEqual({
      base_url: ["El campo base url debe ser una URL válida."],
      timeout: ["El campo timeout debe estar entre 5 y 300."],
    })
    expect(await validateInput({ driver: "disabled", base_url: "https://x.ec", timeout: "300" }, rules)).toEqual({})
  })
})
