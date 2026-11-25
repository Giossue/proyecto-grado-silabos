import { envValue } from "../mail/config"

type Env = Record<string, string | undefined>

export type NotificationEmailConfig = { enabled: boolean; events: string[] }

export const DEFAULT_EMAIL_EVENTS = [
  "convocatoria.abierta",
  "convocatoria.reanudada",
  "silabo.correccion_solicitada",
  "silabo.devuelto_borrador",
  "silabo.aprobado",
  "silabo.enviado",
  "silabo.reenviado_biblioteca",
  "biblioteca.verificado",
  "proceso.reanudado",
  "silabo.eliminado",
  "silabo.regenerado",
  "proceso.plantilla_rehecho",
  "proceso.eliminado",
  "proceso.cierre_proximo",
]

const PHP_TRIM = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g

function phpBool(value: string | null | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  if (value === null) return false
  const lowered = value.toLowerCase()
  if (lowered === "true" || lowered === "(true)") return true
  if (lowered === "false" || lowered === "(false)") return false
  return value !== "" && value !== "0"
}

export function notificationEmailConfig(env: Env = process.env): NotificationEmailConfig {
  const events = String(envValue(env, "NOTIFICATION_EMAIL_EVENTS") ?? "")
    .split(",")
    .map((event) => event.replace(PHP_TRIM, ""))
    .filter((event) => /^[a-z]+\.[a-z_]+$/.test(event))
  return { enabled: phpBool(envValue(env, "NOTIFICATION_EMAILS"), true), events: events.length === 0 ? DEFAULT_EMAIL_EVENTS : events }
}
