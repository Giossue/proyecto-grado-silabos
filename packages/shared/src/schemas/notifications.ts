import { z } from "zod"
import { messages } from "./messages"

export const NOTIFICATION_STATUSES = ["all", "unread"] as const

export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number]

export const EMAIL_NOTICES_NOT_YOURS = "Hay avisos que no corresponden a sus roles."

const EMAIL_SWITCHES: unknown[] = [true, false, 0, 1, "0", "1"]

const isList = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

const isStatus = (value: unknown): value is NotificationStatus => NOTIFICATION_STATUSES.some((status) => status === value)

export const notificationListQuerySchema = z.object({
  status: z
    .unknown()
    .optional()
    .superRefine((value, context) => {
      if (isList(value)) {
        context.addIssue({ code: "custom", message: messages.string("estado") })
        context.addIssue({ code: "custom", message: messages.in("estado") })
        return
      }
      if (value !== undefined && value !== null && !isStatus(value)) context.addIssue({ code: "custom", message: messages.in("estado") })
    })
    .transform((value): NotificationStatus => (isStatus(value) ? value : "all"))
    .describe("Filtro de estado: all (todas) o unread (sin leer)."),
  page: z
    .unknown()
    .optional()
    .transform((value) => (typeof value === "string" ? value : null))
    .describe("Página solicitada."),
})

export type NotificationListQuery = z.output<typeof notificationListQuerySchema>

export function emailPreferencesSchema(allowedTypes: () => readonly string[] | null = () => null) {
  return z
    .object({
      preferences: z.unknown().optional().describe("Avisos por correo: tipo de aviso → verdadero o falso."),
    })
    .superRefine(({ preferences }, context) => {
      const add = (path: string[], message: string) => context.addIssue({ code: "custom", path, message })
      const present = preferences !== undefined && preferences !== null && !(isList(preferences) && Object.keys(preferences).length === 0)
      if (!present) add(["preferences"], messages.required("avisos por correo"))
      else if (!isList(preferences)) {
        add(["preferences"], messages.array("avisos por correo"))
        if (preferences === false) add(["preferences"], messages.min("avisos por correo", 1, "array"))
      }
      if (!isList(preferences)) return
      for (const [key, item] of Object.entries(preferences)) if (!EMAIL_SWITCHES.includes(item)) add(["preferences", key], messages.boolean("aviso por correo"))
      const allowed = allowedTypes()
      if (allowed !== null && Object.keys(preferences).some((key) => !allowed.includes(key))) add(["preferences"], EMAIL_NOTICES_NOT_YOURS)
    })
    .meta({ errorOrder: [] })
}

export type EmailPreferencesInput = z.output<ReturnType<typeof emailPreferencesSchema>>
