import { accountActivationSchema, passwordResetSchema, recoveryLinkSchema } from "@silabos/shared/schemas/auth"
import { passwordStrength, storedPassword } from "./passwordPolicy"
import { createHash, createHmac } from "node:crypto"
import { setTimeout as sleep } from "node:timers/promises"
import { controllerJson, fromController } from "../auth/controllerResponse"
import { clientIp, type AuthRuntime } from "../auth/runtime"
import { isPhpArray, requestInput, type PhpArray } from "../http/input"
import { serverError, validationError } from "../http/responses"
import { throttle, type RateLimiter, type Throttle } from "../http/throttle"
import { validateSchema } from "../http/schemaValidation"
import type { QueuedMail } from "../mail/mailables"
import { stringOf } from "./accountWrites"
import { transliterate } from "./authentication"

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

export async function sendResetLink(request: Request, deps: RecoveryDeps): Promise<Response> {
  try {
    return await linkOutcome(request, deps)
  } catch (error) {
    console.error(error)
    return serverError()
  }
}

export function resetPassword(request: Request, deps: RecoveryDeps): Promise<Response> {
  return resetOutcome(request, deps)
}

export function activateAccount(request: Request, deps: RecoveryDeps): Promise<Response> {
  return activationOutcome(request, deps)
}
