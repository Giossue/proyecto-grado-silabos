import "server-only"
import { sharedRedis } from "../redis/connection"
import { phpString } from "../configuration/phpValues"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { sharedAttemptLimiter, type AttemptLimiter } from "../auth/attemptLimiter"
import { bcryptVerify } from "../auth/bcrypt"
import { sharedAuth, type Auth } from "../auth/betterAuth"
import { controllerJson, fromController } from "../auth/controllerResponse"
import { withSetCookies } from "../auth/cookieQueue"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import { clientIp } from "../auth/runtime"
import { redisReplayGuard, type TotpReplayGuard } from "../auth/totp"
import type { AppSession, BridgeDeps } from "../auth/types"
import { isPhpArray, requestInput, type PhpArray, type PhpValue } from "../http/input"
import { jsonError, apiJson, serverError, unauthenticated, validationError } from "../http/responses"
import { sharedRateLimiter, throttle, type RateLimiter } from "../http/throttle"
import { validateSchema } from "../http/schemaValidation"
import { passwordConfirmationSchema, twoFactorChallengeSchema, twoFactorConfirmationSchema, twoFactorDisableSchema } from "@/schemas/twoFactor"
import { apiErrorCode, TOO_MANY, WEB_APP_ONLY } from "./authentication"
import { qrCodeSvg } from "./twoFactorQr"

export type TwoFactorAccount = { id: string; email: string; pending: boolean; confirmed: boolean }

export interface TwoFactorStore {
  account(userId: string): Promise<TwoFactorAccount | null>
  clearLegacy(userId: string): Promise<void>
}

export type TwoFactorDeps = {
  bridge: BridgeDeps
  auth: () => Auth
  store: TwoFactorStore
  replay: TotpReplayGuard
  throttles: RateLimiter
  attempts: AttemptLimiter
  verifyPassword: (plain: string, hash: string) => Promise<boolean | null>
}

type Executor = { execute(query: SQL): Promise<{ rows: unknown[] }> }

export function twoFactorStoreOn(executor: Executor): TwoFactorStore {
  return {
    async account(userId) {
      const [row] = (
        await executor.execute(sql`select u.usuario_id, u.correo_electronico, d.id is not null as has_secret,
            u.dos_factores_confirmado_en is not null as confirmed
          from usuarios u left join dos_factores_usuario d on d.user_id = u.usuario_id
          where u.usuario_id = ${userId}::uuid limit 1`)
      ).rows as { usuario_id: string; correo_electronico: string; has_secret: boolean; confirmed: boolean }[]
      if (!row) return null
      return { id: row.usuario_id, email: row.correo_electronico, pending: row.has_secret, confirmed: row.confirmed && row.has_secret }
    },
    async clearLegacy(userId) {
      await executor.execute(sql`update usuarios set secreto_dos_factores = null, codigos_recuperacion_dos_factores = null
        where usuario_id = ${userId}::uuid and (secreto_dos_factores is not null or codigos_recuperacion_dos_factores is not null)`)
    },
  }
}

export function lazyRateLimiter(): RateLimiter {
  return {
    attempt: (key, maxAttempts, decaySeconds, now) => sharedRateLimiter().attempt(key, maxAttempts, decaySeconds, now),
    attempts: (key, now) => sharedRateLimiter().attempts(key, now),
  }
}

export function lazyAttemptLimiter(): AttemptLimiter {
  return {
    tooManyAttempts: (key, maxAttempts) => sharedAttemptLimiter().tooManyAttempts(key, maxAttempts),
    hit: (key, decaySeconds) => sharedAttemptLimiter().hit(key, decaySeconds),
    clear: (key) => sharedAttemptLimiter().clear(key),
    availableIn: (key) => sharedAttemptLimiter().availableIn(key),
  }
}

export function defaultTwoFactorDeps(): TwoFactorDeps {
  return {
    bridge: defaultBridgeDeps(),
    auth: sharedAuth,
    store: twoFactorStoreOn(db as unknown as Executor),
    replay: redisReplayGuard(sharedRedis),
    throttles: lazyRateLimiter(),
    attempts: lazyAttemptLimiter(),
    verifyPassword: bcryptVerify,
  }
}

const INVALID_CODE = "El código de autenticación no es válido."
const INVALID_SESSION = "La sesión de verificación ya no es válida. Ingrese nuevamente."
const NOT_ACTIVE = "Active primero la verificación en dos pasos."
const REJECTED_CODES = new Set(["INVALID_CODE", "INVALID_BACKUP_CODE", "TOTP_NOT_ENABLED", "BACKUP_CODES_NOT_ENABLED"])
const LOCKED_CODES = new Set(["TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE", "ACCOUNT_TEMPORARILY_LOCKED"])

const stringOf = (value: PhpValue | undefined): string => (typeof value === "string" ? value : value === undefined || value === null ? "" : String(value))

function statusPayload(account: TwoFactorAccount) {
  return { enabled: account.confirmed, confirmation_required: account.pending && !account.confirmed }
}

const invalidCode = () => fromController(validationError({ code: [INVALID_CODE] }))

type Verified = { userId: string; token: string | null; cookies: string[] }

async function verifyCode(deps: TwoFactorDeps, request: Request, code: string, recovery: string): Promise<Verified> {
  const api = deps.auth().api
  const { response, headers } =
    code !== ""
      ? await api.verifyTOTP({ body: { code }, headers: request.headers, returnHeaders: true })
      : await api.verifyBackupCode({ body: { code: recovery }, headers: request.headers, returnHeaders: true })
  const body = response as { token?: string | null; user?: { id?: string } }
  return { userId: String(body.user?.id ?? ""), token: body.token ?? null, cookies: headers.getSetCookie() }
}

export async function twoFactorChallenge(request: Request, deps: TwoFactorDeps = defaultTwoFactorDeps()): Promise<Response> {
  if (!(await deps.bridge.sessions.fromWebApp(request))) return apiJson({ message: WEB_APP_ONLY }, 400)
  const gate = throttle(deps.throttles, { key: `two-factor-ip:${clientIp(request) ?? ""}`, maxAttempts: 10, decaySeconds: 60 }, deps.bridge.now)
  const limited = await gate.hit()
  if (limited) return limited
  const input = await requestInput(request)
  const { errors } = await validateSchema(twoFactorChallengeSchema, input)
  if (errors !== null) return gate.decorate(fromController(validationError(errors)))
  const code = stringOf(input.code)
  let verified: Verified
  try {
    verified = await verifyCode(deps, request, code, stringOf(input.recovery_code))
  } catch (error) {
    const reason = apiErrorCode(error)
    if (reason !== null && REJECTED_CODES.has(reason)) return gate.decorate(invalidCode())
    if (reason !== null && LOCKED_CODES.has(reason)) return gate.decorate(controllerJson({ message: TOO_MANY }, 429))
    if (reason !== null) return gate.decorate(controllerJson({ message: INVALID_SESSION }, 422))
    throw error
  }
  if (code !== "" && !(await deps.replay.claim(verified.userId, code))) {
    if (verified.token !== null) await (await deps.auth().$context).internalAdapter.deleteSession(verified.token)
    return gate.decorate(invalidCode())
  }
  return withSetCookies(gate.decorate(controllerJson({ message: "Segundo factor verificado." })), verified.cookies)
}

type Authenticated = { input: PhpArray; account: TwoFactorAccount; session: AppSession }

async function authenticated(request: Request, deps: TwoFactorDeps): Promise<Authenticated | Response> {
  const session = await requireSession(request, {}, deps.bridge)
  if (session instanceof Response) return session
  const input = await requestInput(request)
  const account = await deps.store.account(session.user.id)
  if (account === null) return unauthenticated()
  return { input, account, session }
}

async function passwordMatches(input: PhpArray, passwordHash: string, deps: TwoFactorDeps): Promise<boolean | null> {
  const given = input.current_password
  if (isPhpArray(given ?? null)) return null
  return given === undefined || given === null ? false : await deps.verifyPassword(phpString(given), passwordHash)
}

async function confirmedPassword(request: Request, deps: TwoFactorDeps): Promise<Authenticated | Response> {
  const context = await authenticated(request, deps)
  if (context instanceof Response) return context
  const matches = await passwordMatches(context.input, context.session.user.passwordHash, deps)
  if (matches === null) return fromController(serverError())
  const { errors } = await validateSchema(passwordConfirmationSchema(matches), context.input)
  if (errors !== null) return fromController(validationError(errors))
  return context
}

async function freshAccount(deps: TwoFactorDeps, account: TwoFactorAccount): Promise<TwoFactorAccount> {
  return (await deps.store.account(account.id)) ?? account
}

async function recoveryCodesOf(deps: TwoFactorDeps, userId: string): Promise<string[]> {
  return (await deps.auth().api.viewBackupCodes({ body: { userId } })).backupCodes
}

export async function enableTwoFactor(request: Request, deps: TwoFactorDeps = defaultTwoFactorDeps()): Promise<Response> {
  const context = await confirmedPassword(request, deps)
  if (context instanceof Response) return context
  const password = phpString(context.input.current_password)
  const api = deps.auth().api
  const issued = context.account.pending
    ? await api.getTOTPURI({ body: { password }, headers: request.headers })
    : await api.enableTwoFactor({ body: { password }, headers: request.headers })
  const totpURI = "totpURI" in issued ? issued.totpURI : null
  if (typeof totpURI !== "string") return fromController(serverError())
  return apiJson({ ...statusPayload(await freshAccount(deps, context.account)), qr_code_svg: qrCodeSvg(totpURI) })
}

async function claimedCode<T>(deps: TwoFactorDeps, userId: string, code: string, work: () => Promise<T>): Promise<T | Response> {
  if (code !== "" && !(await deps.replay.claim(userId, code))) return invalidCode()
  try {
    return await work()
  } catch (error) {
    if (code !== "") await deps.replay.release(userId, code)
    if (REJECTED_CODES.has(apiErrorCode(error) ?? "")) return invalidCode()
    throw error
  }
}

export async function confirmTwoFactor(request: Request, deps: TwoFactorDeps = defaultTwoFactorDeps()): Promise<Response> {
  const context = await authenticated(request, deps)
  if (context instanceof Response) return context
  const { input, account } = context
  const { errors } = await validateSchema(twoFactorConfirmationSchema, input)
  if (errors !== null) return fromController(validationError(errors))
  if (!account.pending) return invalidCode()
  const verified = await claimedCode(deps, account.id, stringOf(input.code), () => verifyCode(deps, request, stringOf(input.code), ""))
  if (verified instanceof Response) return verified
  const fresh = await freshAccount(deps, account)
  return withSetCookies(apiJson({ ...statusPayload(fresh), recovery_codes: await recoveryCodesOf(deps, account.id) }), verified.cookies)
}

export async function regenerateRecoveryCodes(request: Request, deps: TwoFactorDeps = defaultTwoFactorDeps()): Promise<Response> {
  const context = await confirmedPassword(request, deps)
  if (context instanceof Response) return context
  if (!context.account.confirmed) return fromController(jsonError(422, NOT_ACTIVE))
  const { backupCodes } = await deps.auth().api.generateBackupCodes({ body: { password: phpString(context.input.current_password) }, headers: request.headers })
  return apiJson({ ...statusPayload(await freshAccount(deps, context.account)), recovery_codes: backupCodes })
}

export async function disableTwoFactor(request: Request, deps: TwoFactorDeps = defaultTwoFactorDeps()): Promise<Response> {
  const context = await authenticated(request, deps)
  if (context instanceof Response) return context
  const { input, account } = context
  const matches = await passwordMatches(input, context.session.user.passwordHash, deps)
  if (matches === null) return fromController(serverError())
  const { errors } = await validateSchema(twoFactorDisableSchema({ matches, requireCode: account.confirmed }), input)
  if (errors !== null) return fromController(validationError(errors))
  if (account.confirmed) {
    const key = `two-factor-disable:${account.id}`
    if (await deps.attempts.tooManyAttempts(key, 5)) return controllerJson({ message: TOO_MANY }, 429)
    const code = stringOf(input.code)
    const verified = await claimedCode(deps, account.id, code, () => verifyCode(deps, request, code, stringOf(input.recovery_code)))
    if (verified instanceof Response) {
      await deps.attempts.hit(key, 300)
      return verified
    }
    await deps.attempts.clear(key)
  }
  const cookies: string[] = []
  if (account.pending || account.confirmed) {
    const disabled = await deps.auth().api.disableTwoFactor({ body: { password: phpString(input.current_password) }, headers: request.headers, returnHeaders: true })
    cookies.push(...disabled.headers.getSetCookie())
  }
  await deps.store.clearLegacy(account.id)
  return withSetCookies(apiJson(statusPayload(await freshAccount(deps, account))), cookies)
}
