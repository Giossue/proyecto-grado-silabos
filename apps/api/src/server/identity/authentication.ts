import { activeRoleSchema, loginSchema, passwordUpdateSchema } from "@silabos/shared/schemas/auth"
import { filterEmailShape } from "@silabos/shared/schemas/email"
import { passwordStrength } from "./passwordPolicy"
import { sql, type SQL } from "drizzle-orm"
import { isAPIError } from "better-auth/api"
import { db } from "@/db"
import { bcryptHash, bcryptVerify } from "../auth/bcrypt"
import { sharedAuth, type Auth } from "../auth/betterAuth"
import { defaultBridgeDeps, establish, requireSession } from "../auth/requireSession"
import { sharedAttemptLimiter, type AttemptLimiter } from "../auth/attemptLimiter"
import { isEligible } from "../auth/activeRole"
import { controllerJson, emptyResponse, fromController } from "../auth/controllerResponse"
import { withSetCookies } from "../auth/cookieQueue"
import { mirrorCredentialPassword, type CredentialExecutor } from "../auth/credentials"
import { clientIp, sessionRandom } from "../auth/runtime"
import type { AppSession, BridgeDeps, ResolvedSession } from "../auth/types"
import { institutionToday } from "../dashboard/dashboardQueries"
import { isPhpArray, requestInput, type PhpValue } from "../http/input"
import { aborted, apiJson, serverError, unauthenticated, validationError } from "../http/responses"
import { sharedRateLimiter, throttle, type RateLimiter } from "../http/throttle"
import { validateSchema } from "../http/schemaValidation"
import { createProfileRepository, sessionPayload, type ProfileRepository } from "./session"

export type Credential = { id: string }

export interface CredentialStore {
  findActiveUserByEmail(email: string): Promise<Credential | null>
  mirrorPassword(userId: string): Promise<void>
}

export function credentialStoreOn(executor: CredentialExecutor): CredentialStore {
  return {
    async findActiveUserByEmail(email) {
      const [row] = (await executor.execute(sql`select usuario_id from usuarios where correo_electronico = ${email} and usuario_activo = true limit 1` as SQL))
        .rows as { usuario_id: string }[]
      return row ? { id: String(row.usuario_id) } : null
    },
    mirrorPassword: (userId) => mirrorCredentialPassword(executor, userId),
  }
}

export type AuthenticationDeps = {
  bridge: BridgeDeps
  auth: () => Auth
  credentials: CredentialStore
  profiles: ProfileRepository
  today: () => string
  timezone: () => string
  throttles: RateLimiter
  attempts: AttemptLimiter
  verifyPassword: (plain: string, hash: string) => Promise<boolean | null>
  dummyHash: () => Promise<string>
  production: () => boolean
  pwned?: (prefix: string) => Promise<string>
}

let dummy: Promise<string> | null = null

export function authenticationDepsOn(
  bridge: BridgeDeps,
  credentials: CredentialStore,
  overrides: Partial<Omit<AuthenticationDeps, "bridge" | "credentials">> = {},
): AuthenticationDeps {
  const cost = Number.parseInt(process.env.BCRYPT_ROUNDS ?? "12", 10)
  return {
    bridge,
    auth: sharedAuth,
    credentials,
    profiles: createProfileRepository(),
    today: institutionToday,
    timezone: () => process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil",
    throttles: sharedRateLimiter(),
    attempts: sharedAttemptLimiter(),
    verifyPassword: bcryptVerify,
    dummyHash: () => (dummy ??= bcryptHash(sessionRandom(40), cost)),
    production: () => process.env.APP_ENV === "production",
    ...overrides,
  }
}

export function defaultAuthenticationDeps(): AuthenticationDeps {
  return authenticationDepsOn(defaultBridgeDeps(), credentialStoreOn(db as unknown as CredentialExecutor))
}

export const TOO_MANY = "Demasiados intentos. Intente nuevamente en unos minutos."
export const WEB_APP_ONLY = "Inicie sesión desde la aplicación web."
const INVALID_CREDENTIALS = "Las credenciales proporcionadas no son válidas."

export async function sessionAnswer(session: AppSession, deps: Pick<AuthenticationDeps, "profiles" | "today" | "timezone">, status = 200): Promise<Response> {
  const profile = await deps.profiles.find(session.user.id)
  if (profile === null) throw new Error("The authenticated user has no profile.")
  return controllerJson(sessionPayload(session, profile, deps), status)
}

export async function answerFor(resolved: ResolvedSession, deps: AuthenticationDeps): Promise<Response> {
  const user = await deps.bridge.store.findUser(resolved.userId)
  if (user === null) return unauthenticated()
  return sessionAnswer(await establish(resolved, user, deps.bridge), deps)
}

export { filterEmailShape }

export function transliterate(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\x00-\x7f]/g, "?")
}

const stringInput = (value: PhpValue | undefined): string => (value === undefined || value === null ? "" : value === true ? "1" : value === false ? "" : String(value))

export function apiErrorCode(error: unknown): string | null {
  if (!isAPIError(error)) return null
  const code = (error.body as { code?: unknown } | undefined)?.code
  return typeof code === "string" ? code : null
}

export async function login(request: Request, deps: AuthenticationDeps = defaultAuthenticationDeps()): Promise<Response> {
  if (!(await deps.bridge.sessions.fromWebApp(request))) return apiJson({ message: WEB_APP_ONLY }, 400)
  const input = await requestInput(request)
  if (isPhpArray(("email" in input ? input.email : input.correo_electronico) ?? null)) return serverError()
  const ip = clientIp(request) ?? ""
  const throttled = "email" in input ? input.email : input.correo_electronico
  const gate = throttle(deps.throttles, { key: `login:${transliterate(stringInput(throttled).toLowerCase() + "|" + ip)}`, maxAttempts: 5, decaySeconds: 60 }, deps.bridge.now)
  const limited = await gate.hit()
  if (limited) return limited
  const { errors } = await validateSchema(loginSchema, input)
  if (errors !== null) return gate.decorate(fromController(validationError(errors)))
  const email = stringInput(input.email).toLowerCase()
  const password = stringInput(input.password)
  const throttleKey = transliterate(`${email}|${ip}`)
  const accountKey = `login-account:${email}`
  const tooMany = async (key: string) => {
    const response = controllerJson({ message: TOO_MANY }, 429)
    response.headers.set("Retry-After", String(await deps.attempts.availableIn(key)))
    return gate.decorate(response)
  }
  const refuse = async () => {
    await deps.attempts.hit(throttleKey, 60)
    await deps.attempts.hit(accountKey, 3600)
    return gate.decorate(controllerJson({ message: INVALID_CREDENTIALS }, 422))
  }
  if (await deps.attempts.tooManyAttempts(throttleKey, 5)) return tooMany(throttleKey)
  const credential = await deps.credentials.findActiveUserByEmail(email)
  if (await deps.attempts.tooManyAttempts(accountKey, 20)) return tooMany(accountKey)
  if (credential === null) {
    await deps.verifyPassword(password, await deps.dummyHash())
    return refuse()
  }
  let signedIn: Awaited<ReturnType<typeof signInEmail>>
  try {
    signedIn = await signInEmail(deps, email, password, request)
  } catch (error) {
    if (apiErrorCode(error) === "INVALID_EMAIL_OR_PASSWORD") return refuse()
    throw error
  }
  await deps.attempts.clear(throttleKey)
  const cookies = signedIn.headers.getSetCookie()
  if ("twoFactorRedirect" in signedIn.response && signedIn.response.twoFactorRedirect) {
    return withSetCookies(gate.decorate(controllerJson({ two_factor_required: true, message: "Ingrese el código de su aplicación de autenticación." }, 202)), cookies)
  }
  const resolved = "token" in signedIn.response && typeof signedIn.response.token === "string" ? await deps.bridge.sessions.find(signedIn.response.token) : null
  if (resolved === null) throw new Error("The new session was not stored.")
  return withSetCookies(gate.decorate(await answerFor(resolved, deps)), cookies)
}

function signInEmail(deps: AuthenticationDeps, email: string, password: string, request: Request) {
  return deps.auth().api.signInEmail({ body: { email, password, rememberMe: true }, headers: request.headers, returnHeaders: true })
}

export async function logout(request: Request, deps: AuthenticationDeps = defaultAuthenticationDeps()): Promise<Response> {
  const session = await requireSession(request, {}, deps.bridge)
  if (session instanceof Response) return session
  const { headers } = await deps.auth().api.signOut({ headers: request.headers, returnHeaders: true })
  return withSetCookies(emptyResponse(204), headers.getSetCookie())
}

export async function selectActiveRole(request: Request, deps: AuthenticationDeps = defaultAuthenticationDeps()): Promise<Response> {
  const session = await requireSession(request, { verified: true }, deps.bridge)
  if (session instanceof Response) return session
  const input = await requestInput(request)
  const { errors } = await validateSchema(activeRoleSchema, input)
  if (errors !== null) return fromController(validationError(errors))
  const id = stringInput(input.role_assignment_id)
  const assignment = (await deps.bridge.store.effectiveRoleAssignments(session.user.id)).find((candidate) => candidate.id.toLowerCase() === id.toLowerCase())
  if (!assignment || !isEligible(assignment)) return fromController(aborted(404))
  await deps.bridge.sessions.setActiveRole(session.session, assignment.id)
  return sessionAnswer(await establish(session.session, session.user, deps.bridge), deps)
}

export async function leaveActiveRole(request: Request, deps: AuthenticationDeps = defaultAuthenticationDeps()): Promise<Response> {
  const session = await requireSession(request, { verified: true, activeRole: "optional" }, deps.bridge)
  if (session instanceof Response) return session
  if (session.activeRole !== null) await deps.bridge.sessions.setActiveRole(session.session, null)
  return sessionAnswer(await establish(session.session, session.user, deps.bridge), deps)
}

export async function updatePassword(request: Request, deps: AuthenticationDeps = defaultAuthenticationDeps()): Promise<Response> {
  const session = await requireSession(request, {}, deps.bridge)
  if (session instanceof Response) return session
  const { user } = session
  const input = await requestInput(request)
  const current = input.current_password
  if (isPhpArray(current ?? null)) return serverError()
  const matches = current === undefined || current === null ? false : await deps.verifyPassword(stringInput(current), user.passwordHash)
  if (matches === null) return serverError()
  const strength = passwordStrength("contraseña", { production: deps.production(), pwned: deps.pwned })
  const { errors } = await validateSchema(passwordUpdateSchema({ strength, currentMatches: matches }), input)
  if (errors !== null) return fromController(validationError(errors))
  const changed = await deps.auth().api.changePassword({
    body: { currentPassword: stringInput(current), newPassword: stringInput(input.password), revokeOtherSessions: true },
    headers: request.headers,
    returnHeaders: true,
  })
  await deps.credentials.mirrorPassword(user.id)
  const token = changed.response.token
  const resolved = token === null ? null : await deps.bridge.sessions.find(token)
  if (resolved === null) throw new Error("The password change did not keep a session.")
  if (session.session.activeRoleAssignmentId !== null) await deps.bridge.sessions.setActiveRole(resolved, session.session.activeRoleAssignmentId)
  const refreshed = await deps.bridge.store.findUser(user.id)
  if (refreshed === null) return unauthenticated()
  return withSetCookies(await sessionAnswer(await establish(resolved, refreshed, deps.bridge), deps), changed.headers.getSetCookie())
}
