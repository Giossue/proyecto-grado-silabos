import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { timingSafeEqual } from "node:crypto"
import { db } from "@/db"
import { sharedAttemptLimiter, type AttemptLimiter } from "../auth/attemptLimiter"
import { bcryptVerify } from "../auth/bcrypt"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import { clientIp, laravelRandom, regenerateSession, writerDepsOf, type SessionWriterDeps } from "../auth/sessionWriter"
import { controllerJson, FORWARD, fromController, statefulRequest, type Outcome } from "../auth/statefulRequest"
import { databaseReplayCache, generateTotpSecret, laravelCachePrefix, verifyTotp, type TotpReplayCache } from "../auth/totp"
import { decrypt, encrypt } from "../laravel/encrypter"
import { isPhpArray, laravelInput, type PhpArray, type PhpValue } from "../laravel/input"
import { aborted, laravelHttpError, laravelJson, validationError } from "../laravel/responses"
import { sharedRateLimiter, throttle, type RateLimiter } from "../laravel/throttle"
import { mergeErrors, validateInput, type Rule } from "../laravel/validation"
import { insertAuditEvent, type AuditEventInput } from "../operations/recordAuditEvent"
import { acceptsBody } from "./accountWrites"
import { twoFactorQrCodeSvg } from "./twoFactorQr"

export type TwoFactorAccount = { id: string; email: string; secret: string | null; recoveryCodes: string | null; confirmed: boolean }

export type TwoFactorChanges = { secret?: string | null; recoveryCodes?: string | null; confirmedAt?: number | null }

export interface TwoFactorStore {
  account(userId: string, activeOnly: boolean): Promise<TwoFactorAccount | null>
  update(userId: string, changes: TwoFactorChanges): Promise<void>
  recordAudit(event: AuditEventInput): Promise<void>
}

export type TwoFactorDeps = {
  writer: SessionWriterDeps
  store: TwoFactorStore
  replay: TotpReplayCache
  throttles: RateLimiter
  attempts: AttemptLimiter
  verifyPassword: (plain: string, hash: string) => Promise<boolean | null>
  appName: () => string
  production: () => boolean
}

type Executor = { execute(query: SQL): Promise<{ rows: unknown[] }> }

export function twoFactorStoreOn(executor: Executor): TwoFactorStore {
  return {
    async account(userId, activeOnly) {
      const [row] = (
        await executor.execute(sql`select usuario_id, correo_electronico, secreto_dos_factores, codigos_recuperacion_dos_factores,
            dos_factores_confirmado_en is not null as confirmed
          from usuarios where usuario_id = ${userId}::uuid ${activeOnly ? sql`and usuario_activo = true` : sql``} limit 1`)
      ).rows as { usuario_id: string; correo_electronico: string; secreto_dos_factores: string | null; codigos_recuperacion_dos_factores: string | null; confirmed: boolean }[]
      if (!row) return null
      return {
        id: row.usuario_id,
        email: row.correo_electronico,
        secret: row.secreto_dos_factores,
        recoveryCodes: row.codigos_recuperacion_dos_factores,
        confirmed: row.confirmed,
      }
    },
    async update(userId, changes) {
      const sets: SQL[] = []
      if (changes.secret !== undefined) sets.push(sql`secreto_dos_factores = ${changes.secret}`)
      if (changes.recoveryCodes !== undefined) sets.push(sql`codigos_recuperacion_dos_factores = ${changes.recoveryCodes}`)
      if (changes.confirmedAt !== undefined) {
        sets.push(changes.confirmedAt === null ? sql`dos_factores_confirmado_en = null` : sql`dos_factores_confirmado_en = to_timestamp(${changes.confirmedAt})`)
      }
      if (sets.length === 0) return
      await executor.execute(sql`update usuarios set ${sql.join(sets, sql`, `)} where usuario_id = ${userId}::uuid`)
    },
    recordAudit: (event) => insertAuditEvent(executor, event).then(() => undefined),
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
  const writer = writerDepsOf(defaultBridgeDeps())
  const executor = db as unknown as Executor
  return {
    writer,
    store: twoFactorStoreOn(executor),
    replay: databaseReplayCache(executor, laravelCachePrefix(), writer.now),
    throttles: lazyRateLimiter(),
    attempts: lazyAttemptLimiter(),
    verifyPassword: bcryptVerify,
    appName: () => process.env.LARAVEL_APP_NAME ?? "Laravel",
    production: () => process.env.APP_ENV === "production",
  }
}

const RECOVERY_CODES = 8
const CHALLENGE_SECONDS = 600
const INVALID_CODE = "El código de autenticación no es válido."
const MISSING_CODE = "Ingrese un código de autenticación o de recuperación."
const INVALID_SESSION = "La sesión de verificación ya no es válida. Ingrese nuevamente."
const TOO_MANY = "Demasiados intentos. Intente nuevamente en unos minutos."
const WRONG_PASSWORD = "La contraseña actual no es correcta."
const NOT_ACTIVE = "Active primero la verificación en dos pasos."
const ATTRIBUTES = { current_password: "contraseña actual", code: "código", recovery_code: "código de recuperación" }

const sealed = (value: string, deps: TwoFactorDeps) => encrypt(value, deps.writer.config.key, true)
const opened = (value: string, deps: TwoFactorDeps) => decrypt(value, deps.writer.config.key, true)
const stringOf = (value: PhpValue | undefined): string => (typeof value === "string" ? value : value === undefined || value === null ? "" : String(value))
const phpEmpty = (value: string | null): boolean => value === null || value === "" || value === "0"

function filled(value: PhpValue | undefined): boolean {
  if (typeof value === "boolean" || isPhpArray(value ?? null)) return true
  return stringOf(value).trim() !== ""
}

function hasEnabled(account: TwoFactorAccount): boolean {
  return account.secret !== null && account.confirmed
}

function statusPayload(account: TwoFactorAccount) {
  return { enabled: hasEnabled(account), confirmation_required: account.secret !== null && !account.confirmed }
}

function recoveryCode(): string {
  return `${laravelRandom(10)}-${laravelRandom(10)}`
}

function freshRecoveryCodes(deps: TwoFactorDeps): string {
  return sealed(JSON.stringify(Array.from({ length: RECOVERY_CODES }, recoveryCode)), deps)
}

function recoveryCodesOf(account: TwoFactorAccount, deps: TwoFactorDeps): unknown {
  if (account.recoveryCodes === null) throw new Error("The account has no recovery codes.")
  return JSON.parse(opened(account.recoveryCodes, deps))
}

function sameText(known: string, given: string): boolean {
  const left = Buffer.from(known)
  const right = Buffer.from(given)
  return left.length === right.length && timingSafeEqual(left, right)
}

async function verifySecondFactor(account: TwoFactorAccount, code: string, recovery: string, deps: TwoFactorDeps): Promise<boolean> {
  if (code !== "" && account.secret !== null && (await verifyTotp(opened(account.secret, deps), code, deps.replay, deps.writer.now()))) return true
  if (recovery === "") return false
  const stored = recoveryCodesOf(account, deps)
  const valid = Array.isArray(stored) && stored.some((candidate) => typeof candidate === "string" && sameText(candidate, recovery))
  if (valid && account.recoveryCodes !== null) {
    const replaced = opened(account.recoveryCodes, deps).split(recovery).join(recoveryCode())
    await deps.store.update(account.id, { recoveryCodes: sealed(replaced, deps) })
  }
  return valid
}

function forgetPendingLogin(attributes: Record<string, unknown>): void {
  const pending = attributes.login
  if (typeof pending !== "object" || pending === null || Array.isArray(pending)) return
  for (const key of ["id", "remember", "at"]) delete (pending as Record<string, unknown>)[key]
}

function phpInt(value: unknown): number {
  if (typeof value === "number") return Math.trunc(value)
  if (typeof value === "boolean") return value ? 1 : 0
  if (typeof value === "string") return Number.parseInt(value, 10) || 0
  return 0
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function twoFactorChallenge(request: Request, deps: TwoFactorDeps = defaultTwoFactorDeps()): Promise<Response> {
  return statefulRequest(
    request,
    deps.writer,
    { group: "api" },
    async (context): Promise<Outcome> => {
      if (!acceptsBody(request)) return FORWARD
      const pending = context.attributes.login
      const loginId = typeof pending === "object" && pending !== null && !Array.isArray(pending) ? (pending as Record<string, unknown>).id : undefined
      if (typeof loginId === "string" && !UUID.test(loginId)) return FORWARD
      const key = typeof loginId === "string" ? `two-factor:${loginId}` : `two-factor-ip:${clientIp(request) ?? ""}`
      const gate = throttle(deps.throttles, { key, maxAttempts: 10, decaySeconds: 60 }, deps.writer.now)
      const limited = await gate.hit()
      if (limited) return limited
      const input = await laravelInput(request)
      const errors = await validateInput(input, { code: ["nullable", "string", { max: 32 }], recovery_code: ["nullable", "string", { max: 128 }] }, ATTRIBUTES)
      if (!filled(input.code) && !filled(input.recovery_code)) mergeErrors(errors, "code", [MISSING_CODE])
      if (Object.keys(errors).length > 0) return gate.decorate(fromController(validationError(errors)))
      const account = typeof loginId === "string" ? await deps.store.account(loginId, true) : null
      if (account === null || !hasEnabled(account)) return gate.decorate(controllerJson({ message: INVALID_SESSION }, 422))
      const startedAt = phpInt((pending as Record<string, unknown>).at)
      if (startedAt === 0 || deps.writer.now() - startedAt > CHALLENGE_SECONDS) {
        forgetPendingLogin(context.attributes)
        return gate.decorate(controllerJson({ message: INVALID_SESSION }, 422))
      }
      const attemptsKey = `two-factor-login:${account.id}`
      if (await deps.attempts.tooManyAttempts(attemptsKey, 5)) return gate.decorate(controllerJson({ message: TOO_MANY }, 429))
      if (!(await verifySecondFactor(account, stringOf(input.code), stringOf(input.recovery_code), deps))) {
        await deps.attempts.hit(attemptsKey, 300)
        return gate.decorate(fromController(validationError({ code: [INVALID_CODE] })))
      }
      await deps.attempts.clear(attemptsKey)
      forgetPendingLogin(context.attributes)
      const user = await deps.writer.store.findUser(account.id)
      if (user === null) throw new Error("The verified account has no user.")
      await context.login(user)
      await regenerateSession(context.state, deps.writer)
      await deps.store.recordAudit({
        actorId: user.id,
        roleAssignmentId: null,
        action: "sesion.iniciada",
        resourceType: "usuario",
        resourceId: user.id,
        result: "exito",
        metadata: {},
        occurredAt: deps.writer.now(),
      })
      return gate.decorate(controllerJson({ message: "Segundo factor verificado." }))
    },
    () => laravelJson({ message: "Inicie sesión desde la aplicación web." }, 400),
  )
}

type Authenticated = { input: PhpArray; account: TwoFactorAccount; passwordHash: string }

async function authenticated(request: Request, deps: TwoFactorDeps, fields: string[]): Promise<Authenticated | Response> {
  const session = await requireSession(request, {}, deps.writer)
  if (session instanceof Response) return session
  if (!acceptsBody(request)) return deps.writer.forward(request)
  const input = await laravelInput(request)
  if (fields.some((name) => input[name] !== undefined && input[name] !== null && typeof input[name] !== "string")) return deps.writer.forward(request)
  const account = await deps.store.account(session.user.id, false)
  if (account === null) return deps.writer.forward(request)
  return { input, account, passwordHash: session.user.passwordHash }
}

async function passwordRule(input: PhpArray, passwordHash: string, deps: TwoFactorDeps): Promise<Rule[] | null> {
  const given = input.current_password
  const matches = typeof given === "string" ? await deps.verifyPassword(given, passwordHash) : false
  if (matches === null) return null
  return ["required", "string", { check: () => matches, message: WRONG_PASSWORD }]
}

async function confirmedPassword(request: Request, deps: TwoFactorDeps, fields: string[] = ["current_password"]): Promise<Authenticated | Response> {
  const context = await authenticated(request, deps, fields)
  if (context instanceof Response) return context
  const rule = await passwordRule(context.input, context.passwordHash, deps)
  if (rule === null) return deps.writer.forward(request)
  const errors = await validateInput(context.input, { current_password: rule }, ATTRIBUTES)
  if (Object.keys(errors).length > 0) return fromController(validationError(errors))
  return context
}

export async function enableTwoFactor(request: Request, deps: TwoFactorDeps = defaultTwoFactorDeps()): Promise<Response> {
  const context = await confirmedPassword(request, deps)
  if (context instanceof Response) return context
  const { account } = context
  if (phpEmpty(account.secret)) await deps.store.update(account.id, { secret: sealed(generateTotpSecret(), deps), recoveryCodes: freshRecoveryCodes(deps) })
  const fresh = await deps.store.account(account.id, false)
  if (fresh === null || fresh.secret === null) return fromController(aborted(404))
  return laravelJson({ ...statusPayload(fresh), qr_code_svg: twoFactorQrCodeSvg(deps.appName(), fresh.email, opened(fresh.secret, deps)) })
}

export async function confirmTwoFactor(request: Request, deps: TwoFactorDeps = defaultTwoFactorDeps()): Promise<Response> {
  const context = await authenticated(request, deps, ["code"])
  if (context instanceof Response) return context
  const { input, account } = context
  const errors = await validateInput(input, { code: ["required", "string", { max: 32 }] }, ATTRIBUTES)
  if (Object.keys(errors).length > 0) return fromController(validationError(errors))
  const code = stringOf(input.code)
  const valid = !phpEmpty(account.secret) && !phpEmpty(code) && (await verifyTotp(opened(account.secret as string, deps), code, deps.replay, deps.writer.now()))
  if (!valid) return fromController(validationError({ code: [INVALID_CODE] }))
  await deps.store.update(account.id, { confirmedAt: deps.writer.now() })
  const fresh = (await deps.store.account(account.id, false)) ?? account
  return laravelJson({ ...statusPayload(fresh), recovery_codes: recoveryCodesOf(fresh, deps) })
}

export async function regenerateRecoveryCodes(request: Request, deps: TwoFactorDeps = defaultTwoFactorDeps()): Promise<Response> {
  const context = await confirmedPassword(request, deps)
  if (context instanceof Response) return context
  if (!hasEnabled(context.account)) return fromController(laravelHttpError(422, NOT_ACTIVE))
  await deps.store.update(context.account.id, { recoveryCodes: freshRecoveryCodes(deps) })
  const fresh = (await deps.store.account(context.account.id, false)) ?? context.account
  return laravelJson({ ...statusPayload(fresh), recovery_codes: recoveryCodesOf(fresh, deps) })
}

export async function disableTwoFactor(request: Request, deps: TwoFactorDeps = defaultTwoFactorDeps()): Promise<Response> {
  const context = await authenticated(request, deps, ["current_password", "code", "recovery_code"])
  if (context instanceof Response) return context
  const { input, account } = context
  const rule = await passwordRule(input, context.passwordHash, deps)
  if (rule === null) return deps.writer.forward(request)
  const errors = await validateInput(
    input,
    { current_password: rule, code: ["nullable", "string", { max: 32 }], recovery_code: ["nullable", "string", { max: 128 }] },
    ATTRIBUTES,
  )
  if (hasEnabled(account) && !filled(input.code) && !filled(input.recovery_code)) mergeErrors(errors, "code", [MISSING_CODE])
  if (Object.keys(errors).length > 0) return fromController(validationError(errors))
  if (hasEnabled(account)) {
    const key = `two-factor-disable:${account.id}`
    if (await deps.attempts.tooManyAttempts(key, 5)) return controllerJson({ message: TOO_MANY }, 429)
    if (!(await verifySecondFactor(account, stringOf(input.code), stringOf(input.recovery_code), deps))) {
      await deps.attempts.hit(key, 300)
      return fromController(validationError({ code: [INVALID_CODE] }))
    }
    await deps.attempts.clear(key)
  }
  if (account.secret !== null || account.recoveryCodes !== null || account.confirmed) {
    await deps.store.update(account.id, { secret: null, recoveryCodes: null, confirmedAt: null })
  }
  const fresh = (await deps.store.account(account.id, false)) ?? account
  return laravelJson(statusPayload(fresh))
}
