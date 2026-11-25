// @vitest-environment node
import { describe, expect, it } from "vitest"
import { schemaErrors } from "./issues"
import { screenHelpSchema, systemSettingsSchema } from "./operations"

describe("systemSettingsSchema", () => {
  it("requires the AI address and model unless the assistant is disabled", async () => {
    const valid = { current_password: "x", connect_timeout: 5, timeout: 30 }
    expect(await schemaErrors(systemSettingsSchema("ia", { driver: "deepseek" }, true), { ...valid, driver: "deepseek" })).toEqual({
      base_url: ["Escriba la dirección del proveedor de IA."],
      model: ["Escriba el modelo de IA."],
    })
    expect(await schemaErrors(systemSettingsSchema("ia", { driver: "disabled" }, true), { ...valid, driver: "disabled" })).toEqual({})
  })

  it("requires the Koha address only for Koha and checks the current password", async () => {
    expect(await schemaErrors(systemSettingsSchema("biblioteca", { driver: "koha" }, false), { current_password: "x", driver: "koha", base_url: "ftp://x" })).toEqual({
      current_password: ["La contraseña actual no es correcta."],
      base_url: ["El campo base url debe ser una URL válida."],
    })
    expect(await schemaErrors(systemSettingsSchema("biblioteca", { driver: "koha" }, true), { driver: "koha" })).toEqual({
      current_password: ["Escriba su contraseña actual para guardar."],
      base_url: ["Escriba la dirección del catálogo Koha."],
    })
  })

  it("checks the digest time format", async () => {
    expect(await schemaErrors(systemSettingsSchema("notificaciones", {}, true), { emails: true, digest_time: "25:00" })).toEqual({ digest_time: ["La hora debe tener el formato HH:MM."] })
  })
})

describe("screenHelpSchema", () => {
  it("accepts only screen paths", async () => {
    expect(await schemaErrors(screenHelpSchema, { screen: "inicio" })).toEqual({ screen: ["El formato del campo pantalla no es válido."] })
    expect(await schemaErrors(screenHelpSchema, { screen: "/docente/silabos" })).toEqual({})
  })
})
