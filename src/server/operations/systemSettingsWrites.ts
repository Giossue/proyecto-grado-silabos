import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { bcryptVerify } from "../auth/bcrypt"
import { fromController } from "../auth/controllerResponse"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { AppSession, SessionUser } from "../auth/types"
import { phpBoolean } from "../identity/accountRules"
import { encrypt } from "../http/encrypter"
import { isPhpArray, requestInput, type PhpArray, type PhpValue } from "../http/input"
import { forbidden, apiJson, serverError, validationError } from "../http/responses"
import { sharedRateLimiter, throttle, type RateLimiter, type Throttle } from "../http/throttle"
import { validateInput, type Rule } from "../http/validation"
import { catalogSettings } from "../library/catalogHandlers"
import { createCatalog } from "../library/catalog"
import { kohaFetch } from "../library/kohaHttp"
import { describeSettings, effectiveSettings, SECRET, storedSettings, type SystemSettingsDeps } from "./systemSettings"

export type SettingRow = { field: string; value: unknown }

export type SystemSettingsWriteDeps = SystemSettingsDeps & {
  limiter: RateLimiter
  verifyPassword: (plain: string, hash: string) => Promise<boolean | null>
  save: (rows: SettingRow[], actorId: string, at: number) => Promise<void>
  fetch: (url: string, init: RequestInit) => Promise<Response>
  libraries: () => Promise<unknown[]>
}

const PASSWORD_SECTIONS = ["ia", "biblioteca"]
const DIGEST_TIME = /^([01]\d|2[0-3]):[0-5]\d\n?$/
const MODEL = /^[A-Za-z0-9._:/-]+\n?$/
const NO_SPACES = /^[^\t\n\v\f\r ]+\n?$/
const MESSAGES = {
  "current_password.required": "Escriba su contraseña actual para guardar.",
  "digest_time.regex": "La hora debe tener el formato HH:MM.",
  "base_url.required_if": "Escriba la dirección del catálogo Koha.",
  "base_url.required_unless": "Escriba la dirección del proveedor de IA.",
  "model.required_unless": "Escriba el modelo de IA.",
  "api_key.regex": "La clave no puede tener espacios.",
}
const ATTRIBUTES = { current_password: "contraseña actual" }
const WRONG_PASSWORD = "La contraseña actual no es correcta."

function rulesFor(section: string, passwordMatches: boolean): Record<string, Rule[]> {
  const password: Rule[] = ["required", "string", { check: () => passwordMatches, message: WRONG_PASSWORD }]
  if (section === "notificaciones") return { emails: ["required", "boolean"], digest_time: ["required", "string", { regex: DIGEST_TIME }] }
  if (section === "biblioteca") {
    return {
      current_password: password,
      driver: ["required", { in: ["disabled", "koha"] }],
      base_url: ["nullable", { required_if: ["driver", "koha"] }, "string", { max: 255 }, { url: ["http", "https"] }],
    }
  }
  return {
    current_password: password,
    driver: ["required", { in: ["disabled", "deepseek"] }],
    base_url: ["nullable", { required_unless: ["driver", "disabled"] }, "string", { max: 255 }, { url: ["https"] }],
    model: ["nullable", { required_unless: ["driver", "disabled"] }, "string", { max: 64 }, { regex: MODEL }],
    api_key: ["nullable", "string", { max: 500 }, { regex: NO_SPACES }],
    clear_api_key: ["sometimes", "boolean"],
    connect_timeout: ["required", "integer", { between: [1, 30] }],
    timeout: ["required", "integer", { between: [5, 300] }],
  }
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
  if (!session.user.active || session.activeRole?.role !== "administrador") return finish(fromController(forbidden()))
  return { session, finish }
}

export async function updateSystemSettings(request: Request, section: string, deps: SystemSettingsWriteDeps = defaultSystemSettingsWriteDeps()): Promise<Response> {
  const authorized = await administrator(request, deps)
  if (authorized instanceof Response) return authorized
  const { session, finish } = authorized
  const input = await requestInput(request)
  const matches = await passwordMatches(section, input, session.user, deps)
  if (matches === null) return finish(fromController(serverError()))
  const errors = await validateInput(input, rulesFor(section, matches), ATTRIBUTES, { messages: MESSAGES })
  if (Object.keys(errors).length > 0) return finish(fromController(validationError(errors)))
  const key = deps.bridge.config.key
  const rows = sectionValues(section, input)
  await deps.save(
    rows.map((row) => ({ field: row.field, value: row.field === SECRET && typeof row.value === "string" ? encrypt(row.value, key, false) : row.value })),
    session.user.id,
    deps.bridge.now(),
  )
  return finish(apiJson(describeSettings(await deps.stored(), deps.environment(), key)))
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

export async function testSystemSettings(request: Request, section: string, deps: SystemSettingsWriteDeps = defaultSystemSettingsWriteDeps()): Promise<Response> {
  const authorized = await administrator(request, deps)
  if (authorized instanceof Response) return authorized
  const settings = effectiveSettings(await deps.stored(), deps.environment(), deps.bridge.config.key)
  const result = section === "ia" ? await aiConnection(settings, deps) : await libraryConnection(settings, deps)
  return authorized.finish(apiJson(result))
}

export function saveSettingsOn(executor: { execute(query: SQL): Promise<unknown> }): SystemSettingsWriteDeps["save"] {
  return async (rows, actorId, at) => {
    for (const row of rows) {
      await executor.execute(sql`insert into ajustes_sistema (clave_ajuste, valor_ajuste, modificado_por, modificado_en)
        values (${row.field}, ${JSON.stringify(row.value)}::jsonb, ${actorId}::uuid, to_timestamp(${at}))
        on conflict (clave_ajuste) do update set valor_ajuste = excluded.valor_ajuste, modificado_por = excluded.modificado_por, modificado_en = excluded.modificado_en`)
    }
  }
}

export function defaultSystemSettingsWriteDeps(): SystemSettingsWriteDeps {
  return {
    bridge: defaultBridgeDeps(),
    stored: storedSettings,
    environment: () => process.env,
    limiter: sharedRateLimiter(),
    verifyPassword: bcryptVerify,
    save: (rows, actorId, at) => db.transaction((tx) => saveSettingsOn(tx)(rows, actorId, at)),
    fetch: (url, init) => fetch(url, init),
    libraries: async () => createCatalog(await catalogSettings(), kohaFetch).libraries(),
  }
}
