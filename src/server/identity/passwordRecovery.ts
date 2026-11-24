import "server-only"
import { createHash } from "node:crypto"
import { setTimeout as sleep } from "node:timers/promises"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { bcryptHash, bcryptVerify } from "../auth/bcrypt"
import { defaultBridgeDeps } from "../auth/requireSession"
import { clientIp, writerDepsOf, type SessionWriterDeps } from "../auth/sessionWriter"
import { controllerJson, FORWARD, fromController, statefulRequest, type Outcome } from "../auth/statefulRequest"
import { laravelInput, type PhpArray } from "../laravel/input"
import { validationError } from "../laravel/responses"
import { throttle, type RateLimiter, type Throttle } from "../laravel/throttle"
import { validateInput, type Rule } from "../laravel/validation"
import { insertAuditEvent, type AuditEventInput } from "../operations/recordAuditEvent"
import { acceptsBody, stringOf } from "./accountWrites"
import { filterEmailShape, transliterate } from "./authentication"
import { lazyRateLimiter } from "./twoFactor"

export type Invitation = { id: string; userId: string; hash: string; expiresAt: number; usedAt: number | null; invalidatedAt: number | null }

export interface RecoveryStore {
  userByEmail(email: string): Promise<{ id: string; email: string } | null>
  resetToken(email: string): Promise<{ token: string; createdAt: number | null } | null>
  deleteResetTokens(email: string): Promise<void>
  setPassword(userId: string, hash: string): Promise<void>
  setRememberToken(userId: string, token: string): Promise<void>
  deleteSessions(userId: string): Promise<number>
  lockInvitation(hash: string): Promise<Invitation | null>
  lockUser(userId: string): Promise<{ id: string; active: boolean; verified: boolean } | null>
  activate(userId: string, hash: string, at: number): Promise<void>
  useInvitation(id: string, at: number): Promise<void>
  invalidateOtherInvitations(userId: string, exceptId: string, at: number): Promise<void>
  recordAudit(event: AuditEventInput): Promise<void>
}

export type RecoveryRepository = {
  direct<T>(work: (store: RecoveryStore) => Promise<T>): Promise<T>
  transaction<T>(work: (store: RecoveryStore) => Promise<T>): Promise<T>
}

export type Timebox = <T>(work: (returnEarly: () => void) => Promise<T>) => Promise<T>

export type RecoveryDeps = {
  writer: SessionWriterDeps
  store: RecoveryRepository
  throttles: RateLimiter
  verifyHash: (plain: string, hash: string) => Promise<boolean | null>
  hashPassword: (plain: string) => Promise<string>
  timebox: Timebox
  production: () => boolean
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
    async setPassword(userId, hash) {
      await executor.execute(sql`update usuarios set contrasena = ${hash} where usuario_id = ${userId}::uuid`)
    },
    async setRememberToken(userId, token) {
      await executor.execute(sql`update usuarios set codigo_recordarme = ${token} where usuario_id = ${userId}::uuid`)
    },
    async deleteSessions(userId) {
      return (await executor.execute(sql`delete from sesiones where user_id = ${userId}::uuid`)).rowCount ?? 0
    },
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
      await executor.execute(sql`update usuarios set contrasena = ${hash}, correo_verificado_en = to_timestamp(${at}) where usuario_id = ${userId}::uuid`)
    },
    async useInvitation(id, at) {
      await executor.execute(sql`update invitaciones_activacion set usada_en = to_timestamp(${at}) where invitacion_activacion_id = ${id}::uuid`)
    },
    async invalidateOtherInvitations(userId, exceptId, at) {
      await executor.execute(sql`update invitaciones_activacion set invalidada_en = to_timestamp(${at})
        where usuario_id = ${userId}::uuid and usada_en is null and invalidada_en is null and invitacion_activacion_id <> ${exceptId}::uuid`)
    },
    recordAudit: (event) => insertAuditEvent(executor, event).then(() => undefined),
  }
}

export function laravelTimebox(milliseconds: number): Timebox {
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
    writer: writerDepsOf(defaultBridgeDeps()),
    store: {
      direct: (work) => work(recoveryStoreOn(executor)),
      transaction: (work) => db.transaction((tx) => work(recoveryStoreOn(tx as unknown as Executor))),
    },
    throttles: lazyRateLimiter(),
    verifyHash: bcryptVerify,
    hashPassword: (plain) => bcryptHash(plain, cost),
    timebox: laravelTimebox(200),
    production: () => process.env.APP_ENV === "production",
  }
}

const REMEMBER_LENGTH = 60
const RESET_SECONDS = 3600
const INVALID_LINK = "El enlace para restablecer la contraseña no es válido o ya venció."
const EXPIRED_INVITATION = "El enlace de activación no es válido o ya venció."
const USED_INVITATION = "El enlace de activación no es válido o ya fue utilizado."
const ATTRIBUTES = { email: "correo electrónico", token: "enlace de activación", password: "contraseña" }
const CONFIRMATION = "La confirmación de contraseña no coincide."

class Refused extends Error {
  constructor(readonly errors: Record<string, string[]>) {
    super("refused")
  }
}

function passwordRules(input: PhpArray): Rule[] {
  return ["required", "string", { min: 8 }, { check: (value) => input.password_confirmation === value, message: CONFIRMATION }]
}

async function guarded(request: Request, deps: RecoveryDeps, fields: string[]): Promise<{ input: PhpArray; gate: Throttle } | Outcome> {
  if (deps.production() || !acceptsBody(request)) return FORWARD
  const input = await laravelInput(request)
  if (fields.some((name) => input[name] !== undefined && input[name] !== null && typeof input[name] !== "string")) return FORWARD
  if (typeof input.email === "string" && filterEmailShape(input.email) === "unknown") return FORWARD
  const key = `password-recovery:${transliterate(`${stringOf(input.email).toLowerCase()}|${clientIp(request) ?? ""}`)}`
  const gate = throttle(deps.throttles, { key, maxAttempts: 3, decaySeconds: 60 }, deps.writer.now)
  const limited = await gate.hit()
  if (limited) return limited
  return { input, gate }
}

function served(request: Request, deps: RecoveryDeps, outcome: () => Promise<Outcome>): Promise<Response> {
  return statefulRequest(request, deps.writer, { group: "api" }, outcome, async () => {
    const original = request.clone()
    const result = await outcome()
    return result === FORWARD ? deps.writer.forward(original) : result
  })
}

async function resetOutcome(request: Request, deps: RecoveryDeps): Promise<Outcome> {
  const guard = await guarded(request, deps, ["email", "token", "password", "password_confirmation"])
  if (guard === FORWARD || guard instanceof Response) return guard
  const { input, gate } = guard
  const shape = filterEmailShape(input.email)
  const errors = await validateInput(
    input,
    {
      email: ["required", { check: () => shape === "valid", message: "El campo correo electrónico debe ser un correo electrónico válido." }],
      token: ["required", "string"],
      password: passwordRules(input),
    },
    ATTRIBUTES,
  )
  if (Object.keys(errors).length > 0) return gate.decorate(fromController(validationError(errors)))
  const email = stringOf(input.email).toLowerCase()
  const status = await deps.timebox(async (returnEarly) => {
    const user = await deps.store.direct((store) => store.userByEmail(email))
    if (user === null) return "invalid"
    const record = await deps.store.direct((store) => store.resetToken(user.email))
    const createdAt = record?.createdAt ?? deps.writer.now()
    if (record === null || createdAt + RESET_SECONDS < deps.writer.now()) return "invalid"
    const matches = await deps.verifyHash(stringOf(input.token), record.token)
    if (matches === null) return "forward"
    if (!matches) return "invalid"
    const hash = await deps.hashPassword(stringOf(input.password))
    await deps.store.direct(async (store) => {
      await store.setPassword(user.id, hash)
      await store.setRememberToken(user.id, deps.writer.random(REMEMBER_LENGTH))
      await store.setRememberToken(user.id, deps.writer.random(REMEMBER_LENGTH))
      await store.deleteSessions(user.id)
      await store.deleteResetTokens(user.email)
    })
    returnEarly()
    return "reset"
  })
  if (status === "forward") return FORWARD
  if (status === "invalid") return gate.decorate(controllerJson({ message: INVALID_LINK, errors: { email: [INVALID_LINK] } }, 422))
  return gate.decorate(controllerJson({ message: "Contraseña restablecida. Ya puede iniciar sesión." }))
}

async function activationOutcome(request: Request, deps: RecoveryDeps): Promise<Outcome> {
  const guard = await guarded(request, deps, ["email", "token", "password", "password_confirmation"])
  if (guard === FORWARD || guard instanceof Response) return guard
  const { input, gate } = guard
  const errors = await validateInput(input, { token: ["required", "string", { max: 128 }], password: passwordRules(input) }, ATTRIBUTES)
  if (Object.keys(errors).length > 0) return gate.decorate(fromController(validationError(errors)))
  const now = deps.writer.now()
  const hash = await deps.hashPassword(stringOf(input.password))
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
      await store.setRememberToken(user.id, deps.writer.random(REMEMBER_LENGTH))
      await store.deleteSessions(user.id)
      await store.invalidateOtherInvitations(user.id, invitation.id, now)
      await store.recordAudit({
        actorId: user.id,
        roleAssignmentId: null,
        action: "usuario.activado",
        resourceType: "usuario",
        resourceId: user.id,
        result: "exito",
        metadata: {},
        occurredAt: now,
      })
    })
  } catch (error) {
    if (error instanceof Refused) return gate.decorate(fromController(validationError(error.errors)))
    throw error
  }
  return gate.decorate(controllerJson({ message: "Cuenta activada. Ya puede iniciar sesión." }))
}

export function resetPassword(request: Request, deps: RecoveryDeps = defaultRecoveryDeps()): Promise<Response> {
  return served(request, deps, () => resetOutcome(request, deps))
}

export function activateAccount(request: Request, deps: RecoveryDeps = defaultRecoveryDeps()): Promise<Response> {
  return served(request, deps, () => activationOutcome(request, deps))
}
