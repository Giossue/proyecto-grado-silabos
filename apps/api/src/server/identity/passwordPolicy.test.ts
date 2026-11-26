// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { confirmedPassword, passwordConfirmation, passwordField } from "@silabos/shared/schemas/password"
import { validateSchema } from "../http/schemaValidation"
import { passwordStrength } from "./passwordPolicy"

async function validate(input: Record<string, unknown>) {
  const schema = confirmedPassword(z.object({ password: passwordField("contraseña", passwordStrength("contraseña")), password_confirmation: passwordConfirmation }))
  return (await validateSchema(schema, input)).errors ?? {}
}

describe("passwordStrength: 8 characters and nothing else, in every environment", () => {
  it("asks for 8 characters and the confirmation", async () => {
    const input = { password: "corta", password_confirmation: "otra" }
    expect(await validate(input)).toEqual({
      password: ["El campo contraseña debe tener al menos 8 caracteres.", "La confirmación de contraseña no coincide."],
    })
  })

  it("accepts any 8-character password without asking for case, numbers, symbols or a leak check", async () => {
    vi.stubEnv("APP_ENV", "production")
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    expect(await validate({ password: "abcdefgh", password_confirmation: "abcdefgh" })).toEqual({})
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})
