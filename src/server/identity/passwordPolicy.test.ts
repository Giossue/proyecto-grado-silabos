// @vitest-environment node
import { createHash } from "node:crypto"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { confirmedPassword, passwordConfirmation, passwordField } from "@/schemas/password"
import { validateSchema } from "../http/schemaValidation"
import { passwordStrength, type PasswordPolicyOptions } from "./passwordPolicy"

async function validate(input: Record<string, unknown>, options: PasswordPolicyOptions) {
  const schema = confirmedPassword(z.object({ password: passwordField("contraseña", passwordStrength("contraseña", options)), password_confirmation: passwordConfirmation }))
  return (await validateSchema(schema, input)).errors ?? {}
}

function rangeFor(password: string, count: number): string {
  const hash = createHash("sha1").update(password).digest("hex").toUpperCase()
  return `0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${hash.slice(5)}:${count}\r\n`
}

describe("passwordStrength outside production, like Password::min(8)", () => {
  it("asks for 8 characters and the confirmation", async () => {
    const input = { password: "corta", password_confirmation: "otra" }
    expect(await validate(input, { production: false })).toEqual({
      password: ["El campo contraseña debe tener al menos 8 caracteres.", "La confirmación de contraseña no coincide."],
    })
  })
})

describe("passwordStrength in production, like Password::defaults() of AppServiceProvider", () => {
  it("adds every failed check in Laravel's order, with Spanish messages for the strong-password checks", async () => {
    const input = { password: "corta", password_confirmation: "corta" }
    const errors = await validate(input, { production: true, pwned: vi.fn() })
    expect(errors).toEqual({
      password: ["El campo contraseña debe tener al menos 12 caracteres.", "El campo contraseña debe contener al menos una letra mayúscula y una minúscula", "El campo contraseña debe contener al menos un símbolo", "El campo contraseña debe contener al menos un número"],
    })
  })

  it("asks Have I Been Pwned with only the first five characters of the SHA-1 and rejects a leaked password", async () => {
    const password = "Segura#2026Larga"
    const pwned = vi.fn(async () => rangeFor(password, 3))
    const input = { password, password_confirmation: password }
    expect(await validate(input, { production: true, pwned })).toEqual({ password: ["El campo contraseña aparece en una filtración de datos conocida, escoge un valor diferente"] })
    expect(pwned).toHaveBeenCalledWith(createHash("sha1").update(password).digest("hex").toUpperCase().slice(0, 5))
  })

  it("accepts a strong password that is not in the range or when the service fails", async () => {
    const password = "Segura#2026Larga"
    const input = { password, password_confirmation: password }
    expect(await validate(input, { production: true, pwned: async () => rangeFor("otra", 9) })).toEqual({})
    expect(await validate(input, { production: true, pwned: async () => "" })).toEqual({})
  })
})

describe("passwordStrength in production with a password without letters", () => {
  it("asks for letters and the mixed case in Spanish", async () => {
    const input = { password: "123456789012#", password_confirmation: "123456789012#" }
    expect(await validate(input, { production: true, pwned: vi.fn() })).toEqual({
      password: ["El campo contraseña debe contener al menos una letra mayúscula y una minúscula", "El campo contraseña debe contener al menos una letra"],
    })
  })
})
