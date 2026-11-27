import { fromController } from "../auth/controllerResponse"
import { requireSession } from "../auth/requireSession"
import type { AppSession, SessionUser } from "../auth/types"
import { phpBoolean } from "../identity/accountRules"
import { isPhpArray, requestInput, type PhpArray, type PhpValue } from "../http/input"
import { forbidden, apiJson, serverError, validationError } from "../http/responses"
import { throttle, type RateLimiter, type Throttle } from "../http/throttle"
import { PASSWORD_SECTIONS, systemSettingsSchema } from "@silabos/shared/schemas/operations"
import { validateSchema } from "../http/schemaValidation"
import { describeSettings, effectiveSettings, TEACHER_ASSISTANT_SETTING, type SystemSettingsDeps } from "./systemSettings"

export type SettingRow = { field: string; value: unknown }

export type SystemSettingsWriteDeps = SystemSettingsDeps & {
  limiter: RateLimiter
  verifyPassword: (plain: string, hash: string) => Promise<boolean | null>
  save: (rows: SettingRow[], actorId: string, at: number) => Promise<void>
  libraries: () => Promise<unknown[]>
}

function phpString(value: PhpValue | undefined): string {
  if (value === undefined || value === null || value === false) return ""
  if (value === true) return "1"
  return isPhpArray(value) ? "Array" : String(value)
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
  if (section === "asistente-docente") return [{ field: TEACHER_ASSISTANT_SETTING, value: phpBoolean(input.enabled) }]
  return [
    { field: "library.driver", value: phpString(input.driver) },
    { field: "library.base_url", value: url("base_url") },
  ]
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
  await deps.save(sectionValues(section, input), session.user.id, deps.bridge.now())
  return apiJson(describeSettings(await deps.stored(), deps.environment()))
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

export async function testSystemSettings(request: Request, deps: SystemSettingsWriteDeps): Promise<Response> {
  const authorized = await administrator(request, deps)
  if (authorized instanceof Response) return authorized
  return authorized.finish(await systemSettingsConnection(deps))
}

export async function systemSettingsConnection(deps: SystemSettingsWriteDeps): Promise<Response> {
  return apiJson(await libraryConnection(effectiveSettings(await deps.stored(), deps.environment()), deps))
}
