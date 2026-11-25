import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps } from "../auth/types"
import { DecryptError, decrypt } from "../http/encrypter"
import { apiJson } from "../http/responses"

export type SettingsEnvironment = Record<string, string | undefined>

export type SystemSettingsDeps = {
  bridge: BridgeDeps
  stored: () => Promise<Map<string, unknown>>
  environment: () => SettingsEnvironment
}

export const SECRET = "ai.api_key"
const FIELDS: [field: string, section: "notifications" | "ai" | "library"][] = [
  ["notifications.emails", "notifications"],
  ["notifications.digest_time", "notifications"],
  ["ai.driver", "ai"],
  ["ai.base_url", "ai"],
  ["ai.model", "ai"],
  ["ai.api_key", "ai"],
  ["ai.connect_timeout", "ai"],
  ["ai.timeout", "ai"],
  ["library.driver", "library"],
  ["library.base_url", "library"],
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

function phpInt(value: unknown): number {
  if (typeof value === "number") return Math.trunc(value)
  if (typeof value === "boolean") return value ? 1 : 0
  if (typeof value !== "string") return 0
  const match = /^[ \t\n\r\v\f]*([+-]?\d+)/.exec(value)
  return match ? Number(match[1]) : 0
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
    "ai.driver": envValue(environment, "AI_DRIVER", "disabled"),
    "ai.base_url": envValue(environment, "AI_BASE_URL"),
    "ai.model": envValue(environment, "AI_MODEL"),
    "ai.api_key": envValue(environment, "AI_API_KEY"),
    "ai.connect_timeout": phpInt(envValue(environment, "AI_CONNECT_TIMEOUT", 2)),
    "ai.timeout": phpInt(envValue(environment, "AI_TIMEOUT", 20)),
    "library.driver": envValue(environment, "CATALOG_DRIVER", "disabled"),
    "library.base_url": envValue(environment, "KOHA_BASE_URL"),
  }
}

export function storedSettingsOn(executor: { execute(query: SQL): Promise<{ rows: unknown[] }> }): () => Promise<Map<string, unknown>> {
  return async () => {
    try {
      const result = await executor.execute(sql`select clave_ajuste, valor_ajuste from ajustes_sistema`)
      return new Map((result.rows as { clave_ajuste: string; valor_ajuste: unknown }[]).map((row) => [row.clave_ajuste, row.valor_ajuste]))
    } catch {
      return new Map()
    }
  }
}

export async function storedSettings(): Promise<Map<string, unknown>> {
  try {
    const result = await db.execute(sql`select clave_ajuste, valor_ajuste from ajustes_sistema`)
    return new Map((result.rows as { clave_ajuste: string; valor_ajuste: unknown }[]).map((row) => [row.clave_ajuste, row.valor_ajuste]))
  } catch {
    return new Map()
  }
}

function defaultDeps(): SystemSettingsDeps {
  return { bridge: defaultBridgeDeps(), stored: storedSettings, environment: () => process.env }
}

export function effectiveSettings(stored: Map<string, unknown>, environment: SettingsEnvironment, key: Buffer): Record<string, unknown> {
  const defaults = environmentSettings(environment)
  const result: Record<string, unknown> = {}
  for (const [field] of FIELDS) {
    const saved = stored.has(field)
    let value = saved ? stored.get(field) : defaults[field]
    if (saved && field === SECRET && typeof value === "string") {
      try {
        value = decrypt(value, key, false)
      } catch (error) {
        if (!(error instanceof DecryptError)) throw error
        value = null
      }
    }
    result[field] = value
  }
  return result
}

export function describeSettings(stored: Map<string, unknown>, environment: SettingsEnvironment, key: Buffer) {
  const effective = effectiveSettings(stored, environment, key)
  const result: Record<string, Record<string, unknown>> = { notifications: {}, ai: {}, library: {} }
  for (const [field, section] of FIELDS) {
    const value = effective[field]
    const source = stored.has(field) ? "pantalla" : "entorno"
    const name = field.slice(field.indexOf(".") + 1)
    result[section][name] = field === SECRET ? { configured: typeof value === "string" && value !== "", source } : { value, source }
  }
  return result
}

export async function showSystemSettings(request: Request, deps: SystemSettingsDeps = defaultDeps()): Promise<Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (session.activeRole?.role !== "administrador") return apiJson({ message: FORBIDDEN }, 403)
  return apiJson(describeSettings(await deps.stored(), deps.environment(), deps.bridge.config.key))
}
