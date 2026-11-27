import { sqlState } from "../../prisma/errors"
import { MODELS } from "../http/models"
import { Missing } from "../http/failures"
import { createHash } from "node:crypto"
import type { QueuedMail } from "../mail/mailables"
import type { AfterCommit } from "../queue/dispatch"
import {
  hasCareerScope,
  normalizeName,
  ROLE_ADMINISTRATOR,
  ROLE_COMBINATION_MESSAGE,
  ROLE_COORDINATOR,
  ROLE_LABELS,
  ROLE_LIBRARIAN,
  ROLE_TEACHER,
  roleCombinationConflicts,
} from "./accountRules"

export type Account = { id: string; name: string; email: string; active: boolean; verified: boolean }
export type RoleGrant = { id: string; userId: string; role: string; careerId: string | null; active: boolean }

export interface AccountTx {
  nested<T>(work: () => Promise<T>): Promise<T>
  lockAccount(id: string): Promise<Account | null>
  lockAccountByEmail(email: string): Promise<Account | null>
  insertAccount(account: { name: string; email: string; passwordHash: string }): Promise<Account>
  updateIdentity(id: string, name: string, email: string): Promise<void>
  setActive(id: string, active: boolean): Promise<void>
  effectiveRoles(userId: string): Promise<string[]>
  lockEffectiveGrants(userId: string): Promise<RoleGrant[]>
  lockCurrentCoordinator(careerId: string | null, exceptUserId: string): Promise<{ grantId: string; userId: string; userName: string } | null>
  guardHandover(careerId: string, confirmed: boolean, afterCommit: AfterCommit, now: number): Promise<void>
  returnApprovals(careerId: string, afterCommit: AfterCommit, now: number): Promise<string[]>
  findGrant(userId: string, role: string, careerId: string | null, activeFirst: boolean): Promise<RoleGrant | null>
  lockActiveGrant(userId: string, role: string, careerId: string): Promise<RoleGrant | null>
  insertGrant(userId: string, role: string, careerId: string | null, at: number): Promise<RoleGrant>
  setGrantActive(id: string, active: boolean): Promise<void>
  invitationRole(userId: string): Promise<{ role: string; careerLabel: string | null } | null>
  lockActiveParallelAssignments(grantId: string): Promise<string[]>
  deleteParallelAssignment(id: string): Promise<void>
  closeParallelAssignments(userId: string): Promise<number>
  lockEffectiveCoordinations(userId: string): Promise<{ id: string; label: string }[]>
  isEffectiveAdministrator(userId: string): Promise<boolean>
  otherActiveAdministratorExists(userId: string): Promise<boolean>
  syllabiInProgress(userId: string): Promise<{ careerLabel: string; total: number }[]>
  hasActiveInvitation(userId: string, now: number): Promise<boolean>
  invalidateInvitations(userId: string, now: number): Promise<void>
  insertInvitation(invitation: { userId: string; hash: string; expiresAt: number; issuerId: string; createdAt: number }): Promise<void>
  latestInvitationIssuer(userId: string): Promise<Account | null>
  deleteSessions(userId: string): Promise<number>
  hasActivity(userId: string): Promise<boolean>
  purgeAccount(userId: string): Promise<void>
  careerLocked(careerId: string): Promise<boolean>
}

export interface AccountRepository {
  findAccount(id: string): Promise<Account | null>
  findGrant(id: string): Promise<RoleGrant | null>
  emailTaken(email: string, ignoreUserId: string | null): Promise<boolean>
  activeCareer(id: string): Promise<boolean>
  hasEffectiveRole(userId: string, role: string, careerId: string): Promise<boolean>
  direct<T>(work: (tx: AccountTx) => Promise<T>): Promise<T>
  transaction<T>(work: (tx: AccountTx) => Promise<T>): Promise<T>
}

export type AccountServices = {
  random: (length: number) => string
  hashPassword: (plain: string) => Promise<string>
  frontendUrl: () => string
  queueMail: (mail: QueuedMail) => Promise<unknown>
}

export type ActionContext = {
  tx: AccountTx
  actorId: string
  activeRoleId: string | null
  now: number
  afterCommit: AfterCommit
  services: AccountServices
}

export class AccountValidation extends Error {
  constructor(readonly errors: Record<string, string[]>) {
    super("validation")
  }
}

const invalid = (attribute: string, message: string) => new AccountValidation({ [attribute]: [message] })

const INVITATION_DAYS = 7
export const RESEND = "reenvio"
export const STILL_VALID = "La invitación sigue vigente; podrá reenviarla cuando venza."

export async function issueInvitation(ctx: ActionContext, target: Account): Promise<void> {
  const user = await ctx.tx.lockAccount(target.id)
  if (user === null) throw new Missing(MODELS.user, target.id)
  if (!user.active || user.verified) throw invalid("user", "La cuenta ya está activada o no está disponible para una invitación.")
  await ctx.tx.invalidateInvitations(user.id, ctx.now)
  const token = ctx.services.random(64)
  await ctx.tx.insertInvitation({
    userId: user.id,
    hash: createHash("sha256").update(token).digest("hex"),
    expiresAt: ctx.now + INVITATION_DAYS * 86400,
    issuerId: ctx.actorId,
    createdAt: ctx.now,
  })
  const grant = await ctx.tx.invitationRole(user.id)
  const roleName = grant === null ? "Usuario" : ROLE_LABELS[grant.role]
  const careerName = grant?.careerLabel ?? null
  const activationUrl = `${ctx.services.frontendUrl().replace(/\/+$/, "")}/activar-cuenta?token=${encodeURIComponent(token)}`
  const mail: QueuedMail = { mailable: "activation", to: user.email, data: { name: user.name, roleName, activationUrl, careerName } }
  ctx.afterCommit(() => ctx.services.queueMail(mail))
}

export async function resendActivation(ctx: ActionContext, target: Account, reason: string = RESEND): Promise<void> {
  const locked = await ctx.tx.lockAccount(target.id)
  if (locked === null) throw new Missing(MODELS.user, target.id)
  if (locked.verified) throw invalid("user", "La cuenta ya fue activada por su titular; no se reenvía una invitación.")
  if (reason === RESEND && (await ctx.tx.hasActiveInvitation(locked.id, ctx.now))) throw invalid("user", STILL_VALID)
  await issueInvitation(ctx, locked)
}

export type RoleRequest = { roleCode: string; careerId: string | null; replaceCoordinator: boolean; confirmed?: boolean }

export async function assignRole(ctx: ActionContext, target: { id: string }, request: RoleRequest): Promise<void> {
  const { tx } = ctx
  const role = request.roleCode
  if (!(role in ROLE_LABELS)) throw invalid("role_code", "El rol indicado no es válido.")
  const current = (await tx.lockEffectiveGrants(target.id)).map((grant) => grant.role)
  const hasAdministrator = current.includes(ROLE_ADMINISTRATOR)
  const hasScoped = current.some((code) => code !== ROLE_ADMINISTRATOR)
  if ((role === ROLE_ADMINISTRATOR && hasScoped) || (role !== ROLE_ADMINISTRATOR && hasAdministrator)) {
    throw invalid(
      "role_code",
      role === ROLE_ADMINISTRATOR
        ? "El rol Administrador es exclusivo y no puede agregarse mientras la cuenta conserve otro rol activo."
        : "Una cuenta con el rol Administrador solo puede conservar ese rol.",
    )
  }
  if (roleCombinationConflicts(role, current)) throw invalid("role_code", ROLE_COMBINATION_MESSAGE)
  const careerId = hasCareerScope(role) ? request.careerId : null
  if (role === ROLE_COORDINATOR) {
    const holder = await tx.lockCurrentCoordinator(careerId, target.id)
    if (holder !== null) {
      if (request.replaceCoordinator !== true) throw invalid("replace_coordinator", `La carrera ya tiene como coordinador a ${holder.userName}.`)
      await tx.guardHandover(String(careerId), request.confirmed === true, ctx.afterCommit, ctx.now)
      await tx.setGrantActive(holder.grantId, false)
      await tx.returnApprovals(String(careerId), ctx.afterCommit, ctx.now)
    }
  }
  const grant = await tx.findGrant(target.id, role, careerId, false)
  if (grant === null) await tx.insertGrant(target.id, role, careerId, ctx.now)
  else if (!grant.active) await tx.setGrantActive(grant.id, true)
}

export type NewAccount = { name: string; email: string } & RoleRequest

export async function createManagedUser(ctx: ActionContext, data: NewAccount): Promise<Account> {
  const user = await ctx.tx.insertAccount({
    name: normalizeName(data.name),
    email: data.email.toLowerCase(),
    passwordHash: await ctx.services.hashPassword(ctx.services.random(64)),
  })
  await assignRole(ctx, user, data)
  await issueInvitation(ctx, user)
  return user
}

export async function revokeSessions(ctx: Pick<ActionContext, "tx">, userId: string): Promise<number> {
  return ctx.tx.deleteSessions(userId)
}

async function ensureMayDeactivate(ctx: ActionContext, target: { id: string }): Promise<void> {
  if ((await ctx.tx.isEffectiveAdministrator(target.id)) && !(await ctx.tx.otherActiveAdministratorExists(target.id))) {
    throw invalid("active", "Es la única cuenta de administración activa. Nombre otra antes de desactivarla.")
  }
  const progress = await ctx.tx.syllabiInProgress(target.id)
  if (progress.length > 0) {
    const detail = progress.map((row) => `${row.total} en ${row.careerLabel}`).join(", ")
    throw invalid("active", `Tiene sílabos en curso (${detail}). Coordinación debe asignar otro docente a sus paralelos antes de desactivar la cuenta.`)
  }
}

export async function setUserStatus(ctx: ActionContext, target: { id: string }, active: boolean): Promise<void> {
  if (!active) await ensureMayDeactivate(ctx, target)
  await ctx.tx.setActive(target.id, active)
  if (!active) {
    await revokeSessions(ctx, target.id)
    await ctx.tx.closeParallelAssignments(target.id)
    for (const coordination of await ctx.tx.lockEffectiveCoordinations(target.id)) await ctx.tx.setGrantActive(coordination.id, false)
  }
}

export async function updateManagedUserProfile(ctx: ActionContext, target: { id: string }, data: { name: string; email: string }): Promise<Account> {
  const locked = await ctx.tx.lockAccount(target.id)
  if (locked === null) throw new Missing(MODELS.user, target.id)
  const email = data.email.toLowerCase()
  const name = normalizeName(data.name)
  if (name === locked.name && email === locked.email) return locked
  if (email !== locked.email && locked.verified) {
    throw invalid(
      "correo_electronico",
      "La cuenta ya fue activada y su correo no se puede cambiar. Si otra persona asume sus funciones, cree su cuenta y asígnele el rol.",
    )
  }
  await ctx.tx.updateIdentity(locked.id, name, email)
  const updated = { ...locked, name, email }
  if (locked.email !== email && !locked.verified) await resendActivation(ctx, updated, "correo_corregido")
  return updated
}

export async function removeUserRole(ctx: ActionContext, target: { id: string }, assignment: RoleGrant): Promise<void> {
  const effective = await ctx.tx.lockEffectiveGrants(target.id)
  if (!effective.some((grant) => grant.id === assignment.id)) throw invalid("role", "Ese rol ya no está vigente.")
  if (effective.length === 1) throw invalid("role", "Es el único rol de la cuenta. Deshabilite el acceso en lugar de quitarlo.")
  if (assignment.role === ROLE_TEACHER) {
    for (const id of await ctx.tx.lockActiveParallelAssignments(assignment.id)) await ctx.tx.deleteParallelAssignment(id)
  }
  await ctx.tx.setGrantActive(assignment.id, false)
  await ctx.tx.deleteSessions(target.id)
}

export async function deleteManagedUser(ctx: ActionContext, target: { id: string }): Promise<void> {
  const locked = await ctx.tx.lockAccount(target.id)
  if (locked === null) throw new Missing(MODELS.user, target.id)
  if (locked.verified) throw invalid("user", "La cuenta ya fue activada por su titular. Desactívela en lugar de eliminarla.")
  if (await ctx.tx.hasActivity(locked.id)) throw invalid("user", "La cuenta ya tiene actividad registrada. Desactívela en lugar de eliminarla.")
  await ctx.tx.purgeAccount(locked.id)
}

export async function teacherBlockedReason(tx: AccountTx, user: Account | null): Promise<string | null> {
  if (user === null) return null
  if (!user.active) return "No se puede incorporar esta cuenta. Solicite a Administración que revise su acceso."
  const roles = await tx.effectiveRoles(user.id)
  if (roles.includes(ROLE_ADMINISTRATOR)) return "No se puede incorporar como docente una cuenta con el rol Administrador."
  if (roles.includes(ROLE_LIBRARIAN)) return "No se puede incorporar como docente una cuenta con el rol Bibliotecario."
  return null
}

function isUniqueViolation(error: unknown): boolean {
  return sqlState(error) === "23505"
}

export async function createCareerTeacher(ctx: ActionContext, data: { name: string; email: string }, careerId: string): Promise<{ created: boolean; attached: boolean }> {
  const { tx } = ctx
  const email = data.email.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "").toLowerCase()
  let user = await tx.lockAccountByEmail(email)
  let created = false
  if (user === null) {
    try {
      user = await tx.nested(() => createManagedUser(ctx, { name: data.name, email, roleCode: ROLE_TEACHER, careerId, replaceCoordinator: false }))
      created = true
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      user = await tx.lockAccountByEmail(email)
      if (user === null) throw error
    }
  }
  const blocked = await teacherBlockedReason(tx, user)
  if (blocked !== null) throw invalid("correo_electronico", blocked)
  let grant = await tx.findGrant(user.id, ROLE_TEACHER, careerId, true)
  const reactivated = grant !== null && !grant.active
  if (grant !== null && reactivated) await tx.setGrantActive(grant.id, true)
  let recentlyCreated = false
  if (grant === null) {
    grant = await tx.insertGrant(user.id, ROLE_TEACHER, careerId, ctx.now)
    recentlyCreated = true
  }
  const attached = created || reactivated || recentlyCreated
  if (!user.verified && !(await tx.hasActiveInvitation(user.id, ctx.now))) await issueInvitation(ctx, user)
  return { created, attached }
}

export async function removeCareerTeacher(ctx: ActionContext, target: { id: string }, careerId: string): Promise<number> {
  const { tx } = ctx
  if (await tx.careerLocked(careerId)) throw invalid("process", "Proceso de sílabos activo")
  const grant = await tx.lockActiveGrant(target.id, ROLE_TEACHER, careerId)
  if (grant === null) throw new Missing(MODELS.roleAssignment)
  const parallels = await tx.lockActiveParallelAssignments(grant.id)
  for (const id of parallels) await tx.deleteParallelAssignment(id)
  await tx.setGrantActive(grant.id, false)
  if ((await tx.effectiveRoles(target.id)).length === 0) {
    await revokeSessions(ctx, target.id)
    await tx.invalidateInvitations(target.id, ctx.now)
  }
  return parallels.length
}

