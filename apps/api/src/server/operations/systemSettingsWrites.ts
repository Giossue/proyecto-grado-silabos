import { fromController } from "../auth/controllerResponse"
import { requireSession } from "../auth/requireSession"
import type { AppSession, SessionUser } from "../auth/types"
import { phpBoolean } from "../identity/accountRules"
import { encrypt } from "../http/encrypter"
import { isPhpArray, requestInput, type PhpArray, type PhpValue } from "../http/input"
import { forbidden, apiJson, serverError, validationError } from "../http/responses"
import { throttle, type RateLimiter, type Throttle } from "../http/throttle"
import { PASSWORD_SECTIONS, systemSettingsSchema } from "@silabos/shared/schemas/operations"
import { validateSchema } from "../http/schemaValidation"
import { describeSettings, effectiveSettings, SECRET, type SystemSettingsDeps } from "./systemSettings"

export type SettingRow = { field: string; value: unknown }

export type SystemSettingsWriteDeps = SystemSettingsDeps & {
  limiter: RateLimiter
  verifyPassword: (plain: string, hash: string) => Promise<boolean | null>
  save: (rows: SettingRow[], actorId: string, at: number) => Promise<void>
  fetch: (url: string, init: RequestInit) => Promise<Response>
  libraries: () => Promise<unknown[]>
}

function phpString(value: PhpValue | undefined): string {
  if (value === undefined || value === null || value === false) return ""
  if (value === true) return "1"
  return isPhpArray(value) ? "Array" : String(value)
}

function phpIntval(value: PhpValue | undefined): number {
  if (typeof value === "number") return Math.trunc(value)
  if (typeof value === "boolean") return value ? 1 : 0
  if (typeof value !== "string") return 0
  const match = /^[ \t\n\r\v\f]*([+-]?\d+)/.exec(value)
  return match ? Number(match[1]) : 0
}

function filled(value: PhpValue | undefined): boolean {
  if (typeof value === "boolean" || isPhpArray(value ?? null)) return true
  return phpString(value).trim() !== ""
}

function sectionValues(section: string, input: PhpArray): SettingRow[] {
  const url = (name: string) => (filled(input[name]) ? phpString(input[name]).replace(/\/+$/, "") : null)
  if (section === "notificaciones") {
    return [
      { field: "notifications.emails", value: phpBoolean(input.emails) },
      { field: "notifications.digest_time", value: phpString(input.digest_time) },
    ]
  }
  if (section === "biblioteca") {
    return [
      { field: "library.driver", value: phpString(input.driver) },
      { field: "library.base_url", value: url("base_url") },
    ]
  }
  const rows: SettingRow[] = [
    { field: "ai.driver", value: phpString(input.driver) },
    { field: "ai.base_url", value: url("base_url") },
    { field: "ai.model", value: filled(input.model) ? phpString(input.model) : null },
    { field: "ai.connect_timeout", value: phpIntval(input.connect_timeout) },
    { field: "ai.timeout", value: phpIntval(input.timeout) },
  ]
  if (phpBoolean(input.clear_api_key)) rows.push({ field: SECRET, value: null })
  else if (filled(input.api_key)) rows.push({ field: SECRET, value: phpString(input.api_key) })
  return rows
}

async function passwordMatches(section: string, input: PhpArray, user: SessionUser, deps: SystemSettingsWriteDeps): Promise<boolean | null> {
  if (!PASSWORD_SECTIONS.includes(section)) return false
  const given = input.current_password
  if (given === undefined || given === null || (typeof given === "string" && given.trim() === "")) return false
  if (isPhpArray(given)) return Object.keys(given).length === 0 ? false : null
  return deps.verifyPassword(phpString(given), user.passwordHash)
}

async function administrator(request: Request, deps: SystemSettingsWriteDeps): Promise<{ session: AppSession; finish: (response: Response) => Response } | Response> {
  let gate: Throttle | null = null
  const finish = (response: Response) => (gate as Throttle | null)?.decorate(response) ?? response
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication: (user) => {
        gate = throttle(deps.limiter, { key: `throttle:10,1:${user.id}`, maxAttempts: 10, decaySeconds: 60 }, deps.bridge.now)
        return gate.hit()
      },
    },
    deps.bridge,
  )
  if (session instanceof Response) return finish(session)
  const denied = administratorDenial(session)
  if (denied !== null) return finish(denied)
  return { session, finish }
}

export function administratorDenial(session: AppSession): Response | null {
  return !session.user.active || session.activeRole?.role !== "administrador" ? fromController(forbidden()) : null
}

export async function updateSystemSettings(request: Request, section: string, deps: SystemSettingsWriteDeps): Promise<Response> {
  const authorized = await administrator(request, deps)
  if (authorized instanceof Response) return authorized
  return authorized.finish(await saveSystemSettings(authorized.session, section, await requestInput(request), deps))
}

export async function saveSystemSettings(session: AppSession, section: string, input: PhpArray, deps: SystemSettingsWriteDeps): Promise<Response> {
  const matches = await passwordMatches(section, input, session.user, deps)
  if (matches === null) return fromController(serverError())
  const { errors } = await validateSchema(systemSettingsSchema(section, input, matches), input)
  if (errors !== null) return fromController(validationError(errors))
  const key = deps.bridge.config.key
  const rows = sectionValues(section, input)
  await deps.save(
    rows.map((row) => ({ field: row.field, value: row.field === SECRET && typeof row.value === "string" ? encrypt(row.value, key, false) : row.value })),
    session.user.id,
    deps.bridge.now(),
  )
  return apiJson(describeSettings(await deps.stored(), deps.environment(), key))
}

async function aiConnection(settings: Record<string, unknown>, deps: SystemSettingsWriteDeps): Promise<{ ok: boolean; message: string }> {
  const text = (field: string) => phpString(settings[field] as PhpValue | undefined)
  if (text("ai.driver").trim().toLowerCase() !== "deepseek") return { ok: false, message: "El asistente de IA está desactivado" }
  const apiKey = text(SECRET).trim()
  if (apiKey === "") return { ok: false, message: "Falta la clave del proveedor de IA" }
  const base = text("ai.base_url").trim().replace(/\/+$/, "")
  if (!base.startsWith("https://")) return { ok: false, message: "La dirección del proveedor debe empezar con https://" }
  const timeout = Math.max(5, Math.min(30, phpIntval(settings["ai.timeout"] as PhpValue | undefined)))
  let response: Response
  try {
    response = await deps.fetch(`${base}/models`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
      redirect: "manual",
      signal: AbortSignal.timeout(timeout * 1000),
    })
  } catch {
    return { ok: false, message: "No se pudo conectar con el proveedor de IA" }
  }
  if (response.status >= 200 && response.status < 300) return { ok: true, message: "Conexión correcta con el proveedor de IA" }
  if (response.status === 401 || response.status === 403) return { ok: false, message: "El proveedor no aceptó la clave" }
  return { ok: false, message: `El proveedor de IA respondió con un error (${response.status})` }
}

async function libraryConnection(settings: Record<string, unknown>, deps: SystemSettingsWriteDeps): Promise<{ ok: boolean; message: string }> {
  if (phpString(settings["library.driver"] as PhpValue | undefined).trim().toLowerCase() !== "koha") return { ok: false, message: "La búsqueda en la biblioteca está desactivada" }
  let count: number
  try {
    count = (await deps.libraries()).length
  } catch {
    return { ok: false, message: "No se pudo consultar el catálogo de la biblioteca" }
  }
  return { ok: true, message: count === 1 ? "Conexión correcta: 1 biblioteca" : `Conexión correcta: ${count} bibliotecas` }
}

export async function testSystemSettings(request: Request, section: string, deps: SystemSettingsWriteDeps): Promise<Response> {
  const authorized = await administrator(request, deps)
  if (authorized instanceof Response) return authorized
  return authorized.finish(await systemSettingsConnection(section, deps))
}

export async function systemSettingsConnection(section: string, deps: SystemSettingsWriteDeps): Promise<Response> {
  const settings = effectiveSettings(await deps.stored(), deps.environment(), deps.bridge.config.key)
  const result = section === "ia" ? await aiConnection(settings, deps) : await libraryConnection(settings, deps)
  return apiJson(result)
}
