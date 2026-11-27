import { z } from "zod"
import { is, nullableField, requiredField } from "./fields"
import { phpLooseEquals } from "./php"

export const SCREEN_PATTERN = /^\/[a-z0-9/:_-]*$/

export const screenHelpSchema = z.object({ screen: requiredField("pantalla", [is.string(), is.max(160), is.matches(SCREEN_PATTERN)]) })

const DIGEST_TIME = /^([01]\d|2[0-3]):[0-5]\d\n?$/

export const PASSWORD_SECTIONS = ["biblioteca"]
export const WRONG_PASSWORD = "La contraseña actual no es correcta."

const driverIs = (driver: unknown, expected: string): boolean => (typeof driver === "string" || typeof driver === "number" ? phpLooseEquals(driver, expected) : false)

const currentPassword = (passwordMatches: boolean) =>
  requiredField("contraseña actual", [is.string(), is.satisfying(() => passwordMatches, WRONG_PASSWORD)], { requiredMessage: "Escriba su contraseña actual para guardar." })

export const notificationSettingsSchema = z.object({
  emails: requiredField("emails", [is.boolean()]),
  digest_time: requiredField("digest time", [is.string(), is.matches(DIGEST_TIME, "La hora debe tener el formato HH:MM.")]),
})

export const teacherAssistantSettingsSchema = z.object({
  enabled: requiredField("asistente del docente", [is.boolean()]),
})

export function librarySettingsSchema({ driver, passwordMatches }: { driver: unknown; passwordMatches: boolean }) {
  return z.object({
    current_password: currentPassword(passwordMatches),
    driver: requiredField("driver", [is.oneOf(["disabled", "koha"])]),
    base_url: nullableField("base url", [is.string(), is.max(255), is.url(["http", "https"])], {
      required: driverIs(driver, "koha"),
      requiredMessage: "Escriba la dirección del catálogo Koha.",
    }),
  })
}

export function systemSettingsSchema(section: string, input: { driver?: unknown }, passwordMatches: boolean) {
  if (section === "notificaciones") return notificationSettingsSchema
  if (section === "asistente-docente") return teacherAssistantSettingsSchema
  return librarySettingsSchema({ driver: input.driver, passwordMatches })
}
