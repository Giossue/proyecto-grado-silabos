// @vitest-environment node
import { createHash } from "node:crypto"
import { describe, expect, it, vi } from "vitest"
import { validateInput } from "../http/validation"
import { passwordRules } from "./passwordPolicy"

const ATTRIBUTES = { password: "contraseña" }

function rangeFor(password: string, count: number): string {
  const hash = createHash("sha1").update(password).digest("hex").toUpperCase()
  return `0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${hash.slice(5)}:${count}\r\n`
}

describe("passwordRules outside production, like Password::min(8)", () => {
  it("asks for 8 characters and the confirmation", async () => {
    const input = { password: "corta", password_confirmation: "otra" }
    expect(await validateInput(input, { password: passwordRules(input, { production: false }) }, ATTRIBUTES)).toEqual({
      password: ["El campo contraseña debe tener al menos 8 caracteres.", "La confirmación de contraseña no coincide."],
    })
  })
})

describe("passwordRules in production, like Password::defaults() of AppServiceProvider", () => {
  it("adds every failed check in Laravel's order, with the untranslated keys production shows", async () => {
    const input = { password: "corta", password_confirmation: "corta" }
    const errors = await validateInput(input, { password: passwordRules(input, { production: true, pwned: vi.fn() }) }, ATTRIBUTES)
    expect(errors).toEqual({
      password: ["El campo contraseña debe tener al menos 12 caracteres.", "validation.password.mixed", "validation.password.symbols", "validation.password.numbers"],
    })
  })

  it("asks Have I Been Pwned with only the first five characters of the SHA-1 and rejects a leaked password", async () => {
    const password = "Segura#2026Larga"
    const pwned = vi.fn(async () => rangeFor(password, 3))
    const input = { password, password_confirmation: password }
    expect(await validateInput(input, { password: passwordRules(input, { production: true, pwned }) }, ATTRIBUTES)).toEqual({ password: ["validation.password.uncompromised"] })
    expect(pwned).toHaveBeenCalledWith(createHash("sha1").update(password).digest("hex").toUpperCase().slice(0, 5))
  })

  it("accepts a strong password that is not in the range or when the service fails", async () => {
    const password = "Segura#2026Larga"
    const input = { password, password_confirmation: password }
    expect(await validateInput(input, { password: passwordRules(input, { production: true, pwned: async () => rangeFor("otra", 9) }) }, ATTRIBUTES)).toEqual({})
    expect(await validateInput(input, { password: passwordRules(input, { production: true, pwned: async () => "" }) }, ATTRIBUTES)).toEqual({})
  })
})
