import type { Db } from "../../prisma/db"
import { requireSession } from "../auth/requireSession"
import type { BridgeDeps } from "../auth/types"
import { apiJson } from "../http/responses"

export type SettingsEnvironment = Record<string, string | undefined>

export type SystemSettingsDeps = {
  bridge: BridgeDeps
  stored: () => Promise<Map<string, unknown>>
  environment: () => SettingsEnvironment
}

export const TEACHER_ASSISTANT_SETTING = "teacher_assistant.enabled"
const FIELDS: [field: string, section: "notifications" | "library" | "teacher_assistant"][] = [
  ["notifications.emails", "notifications"],
  ["notifications.digest_time", "notifications"],
  ["library.driver", "library"],
  ["library.base_url", "library"],
  [TEACHER_ASSISTANT_SETTING, "teacher_assistant"],
]
const FORBIDDEN = "No tiene permiso para hacer esto."

export function envValue(environment: SettingsEnvironment, name: string, fallback: unknown = null): unknown {
  const value = environment[name]
  if (value === undefined) return fallback
  const lowered = value.toLowerCase()
  if (lowered === "true" || lowered === "(true)") return true
  if (lowered === "false" || lowered === "(false)") return false
  if (lowered === "empty" || lowered === "(empty)") return ""
  if (lowered === "null" || lowered === "(null)") return null
  const quoted = /^"([\s\S]*)"$/.exec(value) ?? /^'([\s\S]*)'$/.exec(value)
  return quoted ? quoted[1] : value
}

function phpBool(value: unknown): boolean {
  if (typeof value === "string") return value !== "" && value !== "0"
  if (typeof value === "number") return value !== 0
  return Boolean(value)
}

function phpStringCast(value: unknown): string {
  if (typeof value === "string") return value
  if (value === true) return "1"
  if (typeof value === "number") return String(value)
  return ""
}

export function environmentSettings(environment: SettingsEnvironment): Record<string, unknown> {
  const time = phpStringCast(envValue(environment, "NOTIFICATION_DIGEST_TIME", "")).trim()
  return {
    "notifications.emails": phpBool(envValue(environment, "NOTIFICATION_EMAILS", true)),
    "notifications.digest_time": /^([01]?\d|2[0-3]):[0-5]\d$/.test(time) ? time : "08:00",
    "library.driver": envValue(environment, "CATALOG_DRIVER", "disabled"),
    "library.base_url": envValue(environment, "KOHA_BASE_URL"),
    [TEACHER_ASSISTANT_SETTING]: false,
  }
}

export function storedSettingsOn(db: Db): () => Promise<Map<string, unknown>> {
  return async () => {
    try {
      const rows = await db.$queryRaw<{ clave_ajuste: string; valor_ajuste: unknown }[]>`select clave_ajuste, valor_ajuste from ajustes_sistema`
      return new Map(rows.map((row) => [row.clave_ajuste, row.valor_ajuste]))
    } catch {
      return new Map()
    }
  }
}

export async function teacherAssistantEnabledOn(db: Db): Promise<boolean> {
  return (await storedSettingsOn(db)()).get(TEACHER_ASSISTANT_SETTING) === true
}

export function effectiveSettings(stored: Map<string, unknown>, environment: SettingsEnvironment): Record<string, unknown> {
  const defaults = environmentSettings(environment)
  return Object.fromEntries(FIELDS.map(([field]) => [field, stored.has(field) ? stored.get(field) : defaults[field]]))
}

export function describeSettings(stored: Map<string, unknown>, environment: SettingsEnvironment) {
  const effective = effectiveSettings(stored, environment)
  const result: Record<string, Record<string, unknown>> = { notifications: {}, library: {}, teacher_assistant: {} }
  for (const [field, section] of FIELDS) {
    result[section][field.slice(field.indexOf(".") + 1)] = { value: effective[field], source: stored.has(field) ? "pantalla" : "entorno" }
  }
  return result
}

export async function showSystemSettings(request: Request, deps: SystemSettingsDeps): Promise<Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (session.activeRole?.role !== "administrador") return apiJson({ message: FORBIDDEN }, 403)
  return systemSettingsOf(deps)
}

export async function systemSettingsOf(deps: SystemSettingsDeps): Promise<Response> {
  return apiJson(describeSettings(await deps.stored(), deps.environment()))
}
