import { accountActivationSchema, passwordResetSchema, recoveryLinkSchema } from "@silabos/shared/schemas/auth"
import { passwordStrength, storedPassword } from "./passwordPolicy"
import { createHash, createHmac } from "node:crypto"
import { setTimeout as sleep } from "node:timers/promises"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { bcryptHash, bcryptVerify } from "../auth/bcrypt"
import { defaultBridgeDeps } from "../auth/requireSession"
import { controllerJson, fromController } from "../auth/controllerResponse"
import { deleteUserSessions, storeCredentialPassword } from "../auth/credentials"
import { clientIp, runtimeOf, type AuthRuntime } from "../auth/runtime"
import { isPhpArray, requestInput, type PhpArray } from "../http/input"
import { serverError, validationError } from "../http/responses"
import { throttle, type RateLimiter, type Throttle } from "../http/throttle"
import { validateSchema } from "../http/schemaValidation"
import type { QueuedMail } from "../mail/mailables"
import { sharedMailer } from "../mail/mailer"
import { stringOf } from "./accountWrites"
import { transliterate } from "./authentication"
import { lazyRateLimiter } from "./twoFactor"

export type Invitation = { id: string; userId: string; hash: string; expiresAt: number; usedAt: number | null; invalidatedAt: number | null }

export interface RecoveryStore {
  userByEmail(email: string): Promise<{ id: string; email: string } | null>
  resetToken(email: string): Promise<{ token: string; createdAt: number | null } | null>
  deleteResetTokens(email: string): Promise<void>
  insertResetToken(email: string, hash: string, at: number): Promise<void>
  setPassword(userId: string, hash: string): Promise<void>
  deleteSessions(userId: string): Promise<number>
  lockInvitation(hash: string): Promise<Invitation | null>
  lockUser(userId: string): Promise<{ id: string; active: boolean; verified: boolean } | null>
  activate(userId: string, hash: string, at: number): Promise<void>
  useInvitation(id: string, at: number): Promise<void>
  invalidateOtherInvitations(userId: string, exceptId: string, at: number): Promise<void>
}

export type RecoveryRepository = {
  direct<T>(work: (store: RecoveryStore) => Promise<T>): Promise<T>
  transaction<T>(work: (store: RecoveryStore) => Promise<T>): Promise<T>
}

export type Timebox = <T>(work: (returnEarly: () => void) => Promise<T>) => Promise<T>

export type RecoveryDeps = {
  runtime: AuthRuntime
  store: RecoveryRepository
  throttles: RateLimiter
  verifyHash: (plain: string, hash: string) => Promise<boolean | null>
  hashPassword: (plain: string) => Promise<string>
  timebox: Timebox
  production: () => boolean
  pwned?: (prefix: string) => Promise<string>
  sendMail: (mail: QueuedMail) => Promise<unknown>
}

type Executor = { execute(query: SQL): Promise<{ rows: unknown[]; rowCount?: number | null }> }

const epoch = (column: SQL) => sql`extract(epoch from ${column})::bigint`
const seconds = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value))

export function recoveryStoreOn(executor: Executor): RecoveryStore {
  const rows = async (query: SQL) => (await executor.execute(query)).rows as Record<string, unknown>[]
  return {
    async userByEmail(email) {
      const [row] = await rows(sql`select usuario_id, correo_electronico from usuarios where correo_electronico = ${email} limit 1`)
      return row ? { id: String(row.usuario_id), email: String(row.correo_electronico) } : null
    },
    async resetToken(email) {
      const [row] = await rows(sql`select token, ${epoch(sql`created_at`)} as created from restablecimientos_contrasena where email = ${email} limit 1`)
      return row ? { token: String(row.token), createdAt: seconds(row.created) } : null
    },
    async deleteResetTokens(email) {
      await executor.execute(sql`delete from restablecimientos_contrasena where email = ${email}`)
    },
    async insertResetToken(email, hash, at) {
      await executor.execute(sql`insert into restablecimientos_contrasena (email, token, created_at) values (${email}, ${hash}, to_timestamp(${at}))`)
    },
    setPassword: (userId, hash) => storeCredentialPassword(executor, userId, hash),
    deleteSessions: (userId) => deleteUserSessions(executor, userId),
    async lockInvitation(hash) {
      const [row] = await rows(sql`select invitacion_activacion_id, usuario_id, hash_activacion, ${epoch(sql`expira_en`)} as expires,
          ${epoch(sql`usada_en`)} as used, ${epoch(sql`invalidada_en`)} as invalidated
        from invitaciones_activacion where hash_activacion = ${hash} limit 1 for update`)
      if (!row) return null
      return {
        id: String(row.invitacion_activacion_id),
        userId: String(row.usuario_id),
        hash: String(row.hash_activacion),
        expiresAt: Number(row.expires),
        usedAt: seconds(row.used),
        invalidatedAt: seconds(row.invalidated),
      }
    },
    async lockUser(userId) {
      const [row] = await rows(sql`select usuario_id, usuario_activo, correo_verificado_en is not null as verified
        from usuarios where usuario_id = ${userId}::uuid limit 1 for update`)
      return row ? { id: String(row.usuario_id), active: row.usuario_activo === true, verified: row.verified === true } : null
    },
    async activate(userId, hash, at) {
      await storeCredentialPassword(executor, userId, hash)
      await executor.execute(sql`update usuarios set correo_verificado_en = to_timestamp(${at}) where usuario_id = ${userId}::uuid`)
    },
    async useInvitation(id, at) {
      await executor.execute(sql`update invitaciones_activacion set usada_en = to_timestamp(${at}) where invitacion_activacion_id = ${id}::uuid`)
    },
    async invalidateOtherInvitations(userId, exceptId, at) {
      await executor.execute(sql`update invitaciones_activacion set invalidada_en = to_timestamp(${at})
        where usuario_id = ${userId}::uuid and usada_en is null and invalidada_en is null and invitacion_activacion_id <> ${exceptId}::uuid`)
    },
  }
}

export function timebox(milliseconds: number): Timebox {
  return async (work) => {
    const start = performance.now()
    let early = false
    try {
      return await work(() => {
        early = true
      })
    } finally {
      const remainder = milliseconds - (performance.now() - start)
      if (!early && remainder > 0) await sleep(remainder)
    }
  }
}

export function defaultRecoveryDeps(): RecoveryDeps {
  const executor = db as unknown as Executor
  const cost = Number.parseInt(process.env.BCRYPT_ROUNDS ?? "12", 10)
  return {
    runtime: runtimeOf(defaultBridgeDeps()),
    store: {
      direct: (work) => work(recoveryStoreOn(executor)),
      transaction: (work) => db.transaction((tx) => work(recoveryStoreOn(tx as unknown as Executor))),
    },
    throttles: lazyRateLimiter(),
    verifyHash: bcryptVerify,
    hashPassword: (plain) => bcryptHash(plain, cost),
    timebox: timebox(200),
    production: () => process.env.APP_ENV === "production",
    sendMail: (mail) => sharedMailer().send(mail),
  }
}

const RESET_SECONDS = 3600
const RESET_THROTTLE_SECONDS = 60
const LINK_SENT = "Si el correo pertenece a una cuenta activa, recibirá un enlace para restablecer su contraseña."
const INVALID_LINK = "El enlace para restablecer la contraseña no es válido o ya venció."
const EXPIRED_INVITATION = "El enlace de activación no es válido o ya venció."
const USED_INVITATION = "El enlace de activación no es válido o ya fue utilizado."
class Refused extends Error {
  constructor(readonly errors: Record<string, string[]>) {
    super("refused")
  }
}

function strengthOf(deps: RecoveryDeps) {
  return passwordStrength("contraseña", { production: deps.production(), pwned: deps.pwned })
}

async function guarded(request: Request, deps: RecoveryDeps): Promise<{ input: PhpArray; gate: Throttle } | Response> {
  const input = await requestInput(request)
  if (isPhpArray(input.email ?? null)) return serverError()
  const key = `password-recovery:${transliterate(`${stringOf(input.email).toLowerCase()}|${clientIp(request) ?? ""}`)}`
  const gate = throttle(deps.throttles, { key, maxAttempts: 3, decaySeconds: 60 }, deps.runtime.now)
  const limited = await gate.hit()
  if (limited) return limited
  return { input, gate }
}

async function resetOutcome(request: Request, deps: RecoveryDeps): Promise<Response> {
  const guard = await guarded(request, deps)
  if (guard instanceof Response) return guard
  const { input, gate } = guard
  const { errors } = await validateSchema(passwordResetSchema(strengthOf(deps)), input)
  if (errors !== null) return gate.decorate(fromController(validationError(errors)))
  const email = stringOf(input.email).toLowerCase()
  const status = await deps.timebox(async (returnEarly) => {
    const user = await deps.store.direct((store) => store.userByEmail(email))
    if (user === null) return "invalid"
    const record = await deps.store.direct((store) => store.resetToken(user.email))
    const createdAt = record?.createdAt ?? deps.runtime.now()
    if (record === null || createdAt + RESET_SECONDS < deps.runtime.now()) return "invalid"
    const matches = await deps.verifyHash(stringOf(input.token), record.token)
    if (matches === null) return "failed"
    if (!matches) return "invalid"
    const hash = await storedPassword(stringOf(input.password), deps.hashPassword)
    if (hash === null) return "failed"
    await deps.store.direct(async (store) => {
      await store.setPassword(user.id, hash)
      await store.deleteSessions(user.id)
      await store.deleteResetTokens(user.email)
    })
    returnEarly()
    return "reset"
  })
  if (status === "failed") return gate.decorate(fromController(serverError()))
  if (status === "invalid") return gate.decorate(controllerJson({ message: INVALID_LINK, errors: { email: [INVALID_LINK] } }, 422))
  return gate.decorate(controllerJson({ message: "Contraseña restablecida. Ya puede iniciar sesión." }))
}

async function activationOutcome(request: Request, deps: RecoveryDeps): Promise<Response> {
  const guard = await guarded(request, deps)
  if (guard instanceof Response) return guard
  const { input, gate } = guard
  const { errors } = await validateSchema(accountActivationSchema(strengthOf(deps)), input)
  if (errors !== null) return gate.decorate(fromController(validationError(errors)))
  const now = deps.runtime.now()
  const hash = await storedPassword(stringOf(input.password), deps.hashPassword)
  if (hash === null) return gate.decorate(fromController(serverError()))
  try {
    await deps.store.transaction(async (store) => {
      const invitation = await store.lockInvitation(createHash("sha256").update(stringOf(input.token)).digest("hex"))
      if (invitation === null || invitation.usedAt !== null || invitation.invalidatedAt !== null || invitation.expiresAt < now) {
        throw new Refused({ token: [EXPIRED_INVITATION] })
      }
      const user = await store.lockUser(invitation.userId)
      if (user === null || !user.active || user.verified) throw new Refused({ token: [USED_INVITATION] })
      await store.activate(user.id, hash, now)
      await store.useInvitation(invitation.id, now)
      await store.deleteSessions(user.id)
      await store.invalidateOtherInvitations(user.id, invitation.id, now)
    })
  } catch (error) {
    if (error instanceof Refused) return gate.decorate(fromController(validationError(error.errors)))
    throw error
  }
  return gate.decorate(controllerJson({ message: "Cuenta activada. Ya puede iniciar sesión." }))
}

const phpStringCast = (value: PhpArray[string] | undefined): string => (value === undefined || value === null || value === false ? "" : value === true ? "1" : String(value))

async function linkOutcome(request: Request, deps: RecoveryDeps): Promise<Response> {
  const input = await requestInput(request)
  if (isPhpArray(input.email ?? null)) return serverError()
  const email = transliterate(phpStringCast(input.email).toLowerCase())
  const now = deps.runtime.now
  const gates = [
    throttle(deps.throttles, { key: `password-recovery-link:${email}|${clientIp(request) ?? ""}`, maxAttempts: 3, decaySeconds: 60 }, now),
    throttle(deps.throttles, { key: `password-recovery-link:dia:${email}`, maxAttempts: 10, decaySeconds: 86400 }, now),
  ]
  for (const gate of gates) {
    const limited = await gate.hit()
    if (limited) return limited
  }
  const finish = (response: Response) => gates.reduce((decorated, gate) => gate.merge(decorated), response)
  const { errors } = await validateSchema(recoveryLinkSchema, input)
  if (errors !== null) return finish(fromController(validationError(errors)))
  await deps.timebox(async () => {
    const user = await deps.store.direct((store) => store.userByEmail(phpStringCast(input.email).toLowerCase()))
    if (user === null) return
    const record = await deps.store.direct((store) => store.resetToken(user.email))
    if (record !== null && (record.createdAt ?? now()) + RESET_THROTTLE_SECONDS > now()) return
    const token = createHmac("sha256", deps.runtime.config.key).update(deps.runtime.random(40)).digest("hex")
    const hash = await deps.hashPassword(token)
    await deps.store.direct(async (store) => {
      await store.deleteResetTokens(user.email)
      await store.insertResetToken(user.email, hash, now())
    })
    await deps.sendMail({ mailable: "resetPassword", to: user.email, data: { token, email: user.email, expireMinutes: RESET_SECONDS / 60 } })
  })
  return finish(controllerJson({ message: LINK_SENT }, 202))
}

export async function sendResetLink(request: Request, deps: RecoveryDeps = defaultRecoveryDeps()): Promise<Response> {
  try {
    return await linkOutcome(request, deps)
  } catch (error) {
    console.error(error)
    return serverError()
  }
}

export function resetPassword(request: Request, deps: RecoveryDeps = defaultRecoveryDeps()): Promise<Response> {
  return resetOutcome(request, deps)
}

export function activateAccount(request: Request, deps: RecoveryDeps = defaultRecoveryDeps()): Promise<Response> {
  return activationOutcome(request, deps)
}
