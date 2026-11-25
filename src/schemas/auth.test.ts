// @vitest-environment node
import { describe, expect, it } from "vitest"
import { accountActivationSchema, activeRoleSchema, loginSchema, passwordResetSchema, passwordUpdateSchema, recoveryLinkSchema } from "./auth"
import { schemaErrors } from "./issues"

const errorsOf = schemaErrors

describe("loginSchema", () => {
  it("asks for the email and the password", async () => {
    expect(await errorsOf(loginSchema, { email: "", password: "" })).toEqual({ email: ["Ingrese su correo electrónico."], password: ["Ingrese su contraseña."] })
    expect(await errorsOf(loginSchema, { email: null })).toEqual({ email: ["Ingrese su correo electrónico."], password: ["Ingrese su contraseña."] })
  })

  it("rejects an email that PHP's filter_var would reject", async () => {
    expect(await errorsOf(loginSchema, { email: "nombre@", password: "x" })).toEqual({ email: ["Ingrese un correo electrónico válido."] })
    expect(await errorsOf(loginSchema, { email: 5, password: "x" })).toEqual({ email: ["Ingrese un correo electrónico válido."] })
    expect(await errorsOf(loginSchema, { email: "nombre@ueb.edu.ec", password: "x" })).toEqual({})
  })
})

describe("activeRoleSchema", () => {
  it("asks for a role and rejects an id that is not a UUID", async () => {
    expect(await errorsOf(activeRoleSchema, {})).toEqual({ role_assignment_id: ["Seleccione un rol."] })
    expect(await errorsOf(activeRoleSchema, { role_assignment_id: "abc" })).toEqual({ role_assignment_id: ["El rol seleccionado no es válido."] })
  })
})

describe("recoveryLinkSchema", () => {
  it("uses Laravel's Spanish messages for the email", async () => {
    expect(await errorsOf(recoveryLinkSchema, { email: null })).toEqual({ email: ["El campo correo electrónico es obligatorio."] })
    expect(await errorsOf(recoveryLinkSchema, { email: "x" })).toEqual({ email: ["El campo correo electrónico debe ser un correo electrónico válido."] })
    expect(await errorsOf(recoveryLinkSchema, { email: `${"a".repeat(250)}@x.ec` })).toEqual({
      email: ["El campo correo electrónico no debe tener más de 254 caracteres.", "El campo correo electrónico debe ser un correo electrónico válido."],
    })
  })
})

describe("password schemas", () => {
  it("reports the strength messages before the confirmation", async () => {
    const strength = (value: string) => (value.length < 8 ? ["El campo contraseña debe tener al menos 8 caracteres."] : [])
    expect(await errorsOf(accountActivationSchema(strength), { token: "t", password: "corta", password_confirmation: "otra" })).toEqual({
      password: ["El campo contraseña debe tener al menos 8 caracteres.", "La confirmación de contraseña no coincide."],
    })
  })

  it("asks only for the password when it is missing", async () => {
    expect(await errorsOf(passwordResetSchema(), { email: null, token: null, password: "   ", password_confirmation: "" })).toEqual({
      email: ["El campo correo electrónico es obligatorio."],
      token: ["El campo enlace de activación es obligatorio."],
      password: ["El campo contraseña es obligatorio."],
    })
  })

  it("rejects a wrong current password and a new password equal to it", async () => {
    expect(await errorsOf(passwordUpdateSchema({ currentMatches: false }), { current_password: "igual", password: "igual", password_confirmation: "igual" })).toEqual({
      current_password: ["La contraseña es incorrecta."],
      password: ["La contraseña nueva debe ser distinta de la actual."],
    })
    expect(await errorsOf(passwordUpdateSchema(), { password: "nueva", password_confirmation: "nueva" })).toEqual({
      current_password: ["El campo contraseña actual es obligatorio."],
      password: ["La contraseña nueva debe ser distinta de la actual."],
    })
  })
})
