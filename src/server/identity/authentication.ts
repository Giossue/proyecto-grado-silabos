import "server-only"
import { passwordRules, storedPassword } from "./passwordPolicy"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { bcryptHash, bcryptVerify } from "../auth/bcrypt"
import { defaultBridgeDeps } from "../auth/requireSession"
import { sharedAttemptLimiter, type AttemptLimiter } from "../auth/attemptLimiter"
import { isEligible } from "../auth/activeRole"
import { clientIp, invalidateSession, sessionRandom, regenerateSession, regenerateToken, withWriter, type SessionWriterDeps } from "../auth/sessionWriter"
import { controllerJson, emptyResponse, fromController, statefulRequest, type Outcome, type StatefulContext } from "../auth/statefulRequest"
import type { BridgeDeps } from "../auth/types"
import { institutionToday } from "../dashboard/dashboardQueries"
import { parseCookieHeader } from "../http/cookies"
import { recallerCookieName } from "../http/sessionGuard"
import { isPhpArray, requestInput, type PhpValue } from "../http/input"
import { expectsJson } from "../http/request"
import { aborted, jsonError, apiJson, serverError, unauthenticated, validationError } from "../http/responses"
import { sharedRateLimiter, throttle, type RateLimiter } from "../http/throttle"
import { validateInput } from "../http/validation"
import { createProfileRepository, sessionPayload, type ProfileRepository } from "./session"

export type Credential = { id: string; passwordHash: string; twoFactorEnabled: boolean }

export interface CredentialStore {
  findActiveUserByEmail(email: string): Promise<Credential | null>
  rememberToken(userId: string): Promise<string | null>
  setRememberToken(userId: string, token: string): Promise<void>
  setPassword(userId: string, hash: string): Promise<void>
  deleteOtherSessions(userId: string, exceptId: string): Promise<number>
}

export type CredentialExecutor = { execute(query: SQL): Promise<{ rows: unknown[]; rowCount?: number | null }> }

export function credentialStoreOn(executor: CredentialExecutor): CredentialStore {
  const rows = async (query: SQL) => (await executor.execute(query)).rows as Record<string, unknown>[]
  return {
    async findActiveUserByEmail(email) {
      const [row] = await rows(sql`select usuario_id, contrasena,
          (secreto_dos_factores is not null and dos_factores_confirmado_en is not null) as two_factor
        from usuarios where correo_electronico = ${email} and usuario_activo = true limit 1`)
      return row ? { id: String(row.usuario_id), passwordHash: String(row.contrasena), twoFactorEnabled: row.two_factor === true } : null
    },
    async rememberToken(userId) {
      const [row] = await rows(sql`select codigo_recordarme from usuarios where usuario_id = ${userId}::uuid`)
      return row?.codigo_recordarme === null || row?.codigo_recordarme === undefined ? null : String(row.codigo_recordarme)
    },
    async setRememberToken(userId, token) {
      await executor.execute(sql`update usuarios set codigo_recordarme = ${token} where usuario_id = ${userId}::uuid`)
    },
    async setPassword(userId, hash) {
      await executor.execute(sql`update usuarios set contrasena = ${hash} where usuario_id = ${userId}::uuid`)
    },
    async deleteOtherSessions(userId, exceptId) {
      return (await executor.execute(sql`delete from sesiones where user_id = ${userId}::uuid and id <> ${exceptId}`)).rowCount ?? 0
    },
  }
}

export type AuthenticationDeps = {
  writer: SessionWriterDeps
  credentials: CredentialStore
  profiles: ProfileRepository
  today: () => string
  timezone: () => string
  throttles: RateLimiter
  attempts: AttemptLimiter
  verifyPassword: (plain: string, hash: string) => Promise<boolean | null>
  hashPassword: (plain: string) => Promise<string>
  dummyHash: () => Promise<string>
  production: () => boolean
  pwned?: (prefix: string) => Promise<string>
}

let dummy: Promise<string> | null = null

export function authenticationDepsOn(
  bridge: BridgeDeps,
  credentials: CredentialStore,
  overrides: Partial<Omit<AuthenticationDeps, "writer" | "credentials">> = {},
): AuthenticationDeps {
  const cost = Number.parseInt(process.env.BCRYPT_ROUNDS ?? "12", 10)
  return {
    writer: withWriter(bridge),
    credentials,
    profiles: createProfileRepository(),
    today: institutionToday,
    timezone: () => process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil",
    throttles: sharedRateLimiter(),
    attempts: sharedAttemptLimiter(),
    verifyPassword: bcryptVerify,
    hashPassword: (plain) => bcryptHash(plain, cost),
    dummyHash: () => (dummy ??= bcryptHash(sessionRandom(40), cost)),
    production: () => process.env.APP_ENV === "production",
    ...overrides,
  }
}

export function defaultAuthenticationDeps(): AuthenticationDeps {
  return authenticationDepsOn(defaultBridgeDeps(), credentialStoreOn(db as unknown as CredentialExecutor))
}

const TOO_MANY = "Demasiados intentos. Intente nuevamente en unos minutos."

async function payloadOf(context: StatefulContext, deps: AuthenticationDeps): Promise<Response> {
  const session = await context.session()
  if (session === null) return unauthenticated()
  const profile = await deps.profiles.find(session.user.id)
  if (profile === null) throw new Error("The authenticated user has no profile.")
  return controllerJson(sessionPayload(session, profile, deps))
}

const ATOM = String.raw`[\x21\x23-\x27\x2A\x2B\x2D\x2F-\x39\x3D\x3F\x5E-\x7E]+`
const QUOTED = String.raw`\x22(?:[\x01-\x08\x0B\x0C\x0E-\x1F\x21\x23-\x5B\x5D-\x7F]|(?:\x5C[\x00-\x7F]))*\x22`
const COUNTED = String.raw`(?:(?:\x22?\x5C[\x00-\x7E]\x22?)|(?:\x22?[^\x5C\x22]\x22?))`
const OCTET = String.raw`(?:(?:25[0-5])|(?:2[0-4][0-9])|(?:1[0-9]{2})|(?:[1-9]?[0-9]))`
const HOSTNAME = String.raw`(?:(?!.*[^.]{64,})(?:(?:(?:xn--)?[a-z0-9]+(?:-+[a-z0-9]+)*\.){1,126}){1,}(?:(?:[a-z][a-z0-9]*)|(?:(?:xn--)[a-z0-9]+))(?:-+[a-z0-9]+)*)`
const IPV6 = String.raw`(?:IPv6:(?:(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){7})|(?:(?!(?:.*[a-f0-9][:\]]){7,})(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){0,5})?::(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){0,5})?)))`
const IPV4_TAIL = String.raw`(?:(?:IPv6:(?:(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){5}:)|(?:(?!(?:.*[a-f0-9]:){5,})(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){0,3})?::(?:[a-f0-9]{1,4}(?::[a-f0-9]{1,4}){0,3}:)?)))?${OCTET}(?:\.${OCTET}){3})`
const PHP_FILTER_EMAIL = new RegExp(
  `^(?!${COUNTED}{255,})(?!${COUNTED}{65,}@)(?:(?:${ATOM})|(?:${QUOTED}))(?:\\.(?:(?:${ATOM})|(?:${QUOTED})))*@(?:${HOSTNAME}|(?:\\[(?:${IPV6}|${IPV4_TAIL})\\]))$`,
  "i",
)

export function filterEmailShape(value: PhpValue | undefined): "valid" | "invalid" {
  if (typeof value !== "string" || Buffer.byteLength(value) > 320) return "invalid"
  return PHP_FILTER_EMAIL.test(value) ? "valid" : "invalid"
}

export function transliterate(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\x00-\x7f]/g, "?")
}

const stringInput = (value: PhpValue | undefined): string => (value === undefined || value === null ? "" : value === true ? "1" : value === false ? "" : String(value))

export function csrfCookie(request: Request, deps: AuthenticationDeps = defaultAuthenticationDeps()): Promise<Response> {
  return statefulRequest(request, deps.writer, { group: "web", routeName: "sanctum.csrf-cookie" }, async () => emptyResponse(204))
}

export function login(request: Request, deps: AuthenticationDeps = defaultAuthenticationDeps()): Promise<Response> {
  return statefulRequest(
    request,
    deps.writer,
    { group: "api" },
    async (context): Promise<Outcome> => {
      const input = await requestInput(request)
      if (isPhpArray(("email" in input ? input.email : input.correo_electronico) ?? null)) return serverError()
      const shape = filterEmailShape(input.email)
      const ip = clientIp(request) ?? ""
      const throttled = "email" in input ? input.email : input.correo_electronico
      const gate = throttle(deps.throttles, { key: `login:${transliterate(stringInput(throttled).toLowerCase() + "|" + ip)}`, maxAttempts: 5, decaySeconds: 60 }, deps.writer.now)
      const limited = await gate.hit()
      if (limited) return limited
      const errors = await validateInput(
        input,
        {
          email: ["required", { check: () => shape === "valid", message: "Ingrese un correo electrónico válido." }],
          password: ["required", "string"],
        },
        { email: "correo electrónico", password: "contraseña" },
        { messages: { "email.required": "Ingrese su correo electrónico.", "password.required": "Ingrese su contraseña." } },
      )
      if (Object.keys(errors).length > 0) return gate.decorate(fromController(validationError(errors)))
      const email = stringInput(input.email).toLowerCase()
      const throttleKey = transliterate(`${email}|${ip}`)
      const tooMany = async (key: string) => {
        const response = controllerJson({ message: TOO_MANY }, 429)
        response.headers.set("Retry-After", String(await deps.attempts.availableIn(key)))
        return gate.decorate(response)
      }
      if (await deps.attempts.tooManyAttempts(throttleKey, 5)) return tooMany(throttleKey)
      const credential = await deps.credentials.findActiveUserByEmail(email)
      const matches = await deps.verifyPassword(stringInput(input.password), credential ? credential.passwordHash : await deps.dummyHash())
      if (matches === null) return serverError()
      const accountKey = `login-account:${email}`
      if (await deps.attempts.tooManyAttempts(accountKey, 20)) return tooMany(accountKey)
      if (credential === null || !matches) {
        await deps.attempts.hit(throttleKey, 60)
        await deps.attempts.hit(accountKey, 3600)
        return gate.decorate(controllerJson({ message: "Las credenciales proporcionadas no son válidas." }, 422))
      }
      await deps.attempts.clear(throttleKey)
      if (credential.twoFactorEnabled) {
        const current = context.attributes.login
        const pending = typeof current === "object" && current !== null && !Array.isArray(current) ? (current as Record<string, unknown>) : {}
        pending.id = credential.id
        pending.at = deps.writer.now()
        context.attributes.login = pending
        return gate.decorate(controllerJson({ two_factor_required: true, message: "Ingrese el código de su aplicación de autenticación." }, 202))
      }
      const user = await deps.writer.store.findUser(credential.id)
      if (user === null) throw new Error("The credential has no user.")
      await context.login(user)
      await regenerateSession(context.state, deps.writer)
      return gate.decorate(await payloadOf(context, deps))
    },
    () => apiJson({ message: "Inicie sesión desde la aplicación web." }, 400),
  )
}

export function logout(request: Request, deps: AuthenticationDeps = defaultAuthenticationDeps()): Promise<Response> {
  return statefulRequest(request, deps.writer, { group: "api", authenticates: true }, async (context): Promise<Outcome> => {
    const user = context.user
    if (user === null) return unauthenticated()
    if (parseCookieHeader(request.headers.get("cookie")).has(recallerCookieName())) context.forgetRecaller()
    if (((await deps.credentials.rememberToken(user.id)) ?? "") !== "") await deps.credentials.setRememberToken(user.id, deps.writer.random(60))
    context.logout()
    await invalidateSession(context.state, deps.writer)
    regenerateToken(context.state, deps.writer)
    return emptyResponse(204)
  })
}

function verifiedUser(context: StatefulContext, request: Request): Outcome | null {
  if (context.user === null) return unauthenticated()
  if (context.user.emailVerifiedAt !== null) return null
  return fromController(expectsJson(request) ? jsonError(403, "Your email address is not verified.") : serverError())
}

export function selectActiveRole(request: Request, deps: AuthenticationDeps = defaultAuthenticationDeps()): Promise<Response> {
  return statefulRequest(request, deps.writer, { group: "api", authenticates: true }, async (context): Promise<Outcome> => {
    const blocked = verifiedUser(context, request)
    if (blocked !== null) return blocked
    const user = context.user!
    const input = await requestInput(request)
    const errors = await validateInput(input, { role_assignment_id: ["required", "uuid"] }, {}, {
      messages: { "role_assignment_id.required": "Seleccione un rol.", "role_assignment_id.uuid": "El rol seleccionado no es válido." },
    })
    if (Object.keys(errors).length > 0) return fromController(validationError(errors))
    const id = stringInput(input.role_assignment_id)
    const assignment = (await deps.writer.store.effectiveRoleAssignments(user.id)).find((candidate) => candidate.id.toLowerCase() === id.toLowerCase())
    if (!assignment || !isEligible(assignment)) return fromController(aborted(404))
    context.attributes.active_role_assignment_id = assignment.id
    await regenerateSession(context.state, deps.writer)
    context.rememberRole(null)
    return payloadOf(context, deps)
  })
}

export function leaveActiveRole(request: Request, deps: AuthenticationDeps = defaultAuthenticationDeps()): Promise<Response> {
  return statefulRequest(request, deps.writer, { group: "api", authenticates: true }, async (context): Promise<Outcome> => {
    const blocked = verifiedUser(context, request)
    if (blocked !== null) return blocked
    const current = await context.activeRole()
    if (current !== null) {
      delete context.attributes.active_role_assignment_id
      context.rememberRole(null)
      await regenerateSession(context.state, deps.writer)
    }
    return payloadOf(context, deps)
  })
}

export function updatePassword(request: Request, deps: AuthenticationDeps = defaultAuthenticationDeps()): Promise<Response> {
  return statefulRequest(request, deps.writer, { group: "api", authenticates: true }, async (context): Promise<Outcome> => {
    const user = context.user
    if (user === null) return unauthenticated()
    const input = await requestInput(request)
    const current = input.current_password
    if (isPhpArray(current ?? null)) return serverError()
    const matches = current === undefined || current === null ? false : await deps.verifyPassword(stringInput(current), user.passwordHash)
    if (matches === null) return serverError()
    const password = input.password
    const errors = await validateInput(
      input,
      {
        current_password: ["required", "string", { check: () => matches, message: "La contraseña es incorrecta." }],
        password: [
          ...passwordRules(input, { production: deps.production(), pwned: deps.pwned }),
          { check: (value) => "current_password" in input && input.current_password !== value, message: "La contraseña nueva debe ser distinta de la actual." },
        ],
      },
      { current_password: "contraseña actual", password: "contraseña" },
    )
    if (Object.keys(errors).length > 0) return fromController(validationError(errors))
    const hash = await storedPassword(stringInput(password), deps.hashPassword)
    if (hash === null) return serverError()
    await deps.credentials.setPassword(user.id, hash)
    await deps.credentials.setRememberToken(user.id, deps.writer.random(60))
    await deps.credentials.deleteOtherSessions(user.id, context.state.id)
    context.user = { ...user, passwordHash: hash }
    return payloadOf(context, deps)
  })
}
