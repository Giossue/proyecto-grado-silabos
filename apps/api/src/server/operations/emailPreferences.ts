import { requireSession, defaultBridgeDeps } from "../auth/requireSession"
import type { BridgeDeps } from "../auth/types"
import { isPhpArray, requestInput, phpCount, type PhpArray, type PhpValue } from "../http/input"
import { apiJson, validationError } from "../http/responses"
import { throttle, type RateLimiter } from "../http/throttle"
import { emailOptionsFor } from "./emailNoticeCatalog"

export type EmailPreferencesDeps = { bridge: BridgeDeps }

export interface EmailPreferencesRepository {
  save(userId: string, preferences: Record<string, unknown>): Promise<void>
}

export type EmailPreferencesUpdateDeps = {
  bridge: BridgeDeps
  limiter: RateLimiter
  preferences: EmailPreferencesRepository
}

const REQUIRED = "El campo avisos por correo es obligatorio."
const NOT_A_LIST = "El campo avisos por correo debe ser una lista."
const TOO_FEW = "El campo avisos por correo debe tener al menos 1 elementos."
const NOT_A_SWITCH = "El campo aviso por correo debe ser verdadero o falso."
const NOT_YOURS = "Hay avisos que no corresponden a sus roles."
const SWITCHES: PhpValue[] = [true, false, 0, 1, "0", "1"]

export async function showEmailPreferences(
  request: Request,
  deps: EmailPreferencesDeps = { bridge: defaultBridgeDeps() },
): Promise<Response> {
  const session = await requireSession(request, { verified: true }, deps.bridge)
  if (session instanceof Response) return session
  const roles = (await deps.bridge.store.effectiveRoleAssignments(session.user.id)).map((assignment) => assignment.role)
  return apiJson({ options: emailOptionsFor(roles, session.user.emailPreferences) })
}

function validate(value: PhpValue | undefined, allowed: string[]): Record<string, string[]> {
  const errors: Record<string, string[]> = {}
  const add = (key: string, message: string) => {
    errors[key] = [...(errors[key] ?? []), message]
  }
  const present = value !== undefined && value !== null && !(isPhpArray(value) && phpCount(value) === 0)
  if (!present) add("preferences", REQUIRED)
  else if (!isPhpArray(value)) {
    add("preferences", NOT_A_LIST)
    if (value === false) add("preferences", TOO_FEW)
  }
  if (isPhpArray(value)) {
    for (const [key, item] of Object.entries(value)) if (!SWITCHES.includes(item)) add(`preferences.${key}`, NOT_A_SWITCH)
    if (Object.keys(value).some((key) => !allowed.includes(key))) add("preferences", NOT_YOURS)
  }
  return errors
}

function storedPreferences(current: unknown): Record<string, unknown> {
  if (current === null || current === undefined) return {}
  if (typeof current === "object") return { ...(current as Record<string, unknown>) }
  return { "0": current }
}

export async function updateEmailPreferences(request: Request, deps: EmailPreferencesUpdateDeps): Promise<Response> {
  const limit = (userId: string) => ({ key: `throttle:20,1:${userId}`, maxAttempts: 20, decaySeconds: 60 })
  let gate: ReturnType<typeof throttle> | null = null
  const session = await requireSession(
    request,
    {
      verified: true,
      afterAuthentication: (user) => {
        gate = throttle(deps.limiter, limit(user.id), deps.bridge.now)
        return gate.hit()
      },
    },
    deps.bridge,
  )
  const finish = (response: Response) => (gate as ReturnType<typeof throttle> | null)?.decorate(response) ?? response
  if (session instanceof Response) return finish(session)

  const roles = (await deps.bridge.store.effectiveRoleAssignments(session.user.id)).map((assignment) => assignment.role)
  const allowed = emailOptionsFor(roles, null).map((option) => option.type)
  const input: PhpArray = await requestInput(request)
  const errors = validate(input.preferences, allowed)
  if (Object.keys(errors).length > 0) return finish(validationError(errors))

  const requested = Object.fromEntries(Object.entries(input.preferences as PhpArray).map(([key, item]) => [key, item === true || item === 1 || item === "1"]))
  const preferences = { ...storedPreferences(session.user.emailPreferences), ...requested }
  await deps.preferences.save(session.user.id, preferences)
  return finish(apiJson({ options: emailOptionsFor(roles, preferences) }))
}
