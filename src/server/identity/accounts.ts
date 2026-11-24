import { createHash } from "node:crypto"
import type { QueuedMail } from "../mail/mailables"
import type { AuditEventInput } from "../operations/recordAuditEvent"
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
export type Accessibility = { high_contrast: boolean; text_size: string; no_motion: boolean; wide_spacing: boolean }

export interface AccountTx {
  nested<T>(work: () => Promise<T>): Promise<T>
  lockAccount(id: string): Promise<Account | null>
  lockAccountByEmail(email: string): Promise<Account | null>
  insertAccount(account: { name: string; email: string; passwordHash: string }): Promise<Account>
  updateIdentity(id: string, name: string, email: string): Promise<void>
  setActive(id: string, active: boolean): Promise<void>
  setRememberToken(id: string, token: string): Promise<void>
  lockFormation(id: string): Promise<{ formation: string | null } | null>
  setFormation(id: string, formation: string): Promise<void>
  setAccessibility(id: string, preferences: Accessibility): Promise<void>
  effectiveRoles(userId: string): Promise<string[]>
  lockEffectiveGrants(userId: string): Promise<RoleGrant[]>
  lockCurrentCoordinator(careerId: string | null, exceptUserId: string): Promise<{ grantId: string; userId: string; userName: string } | null>
  careerHasReviewedSyllabi(careerId: string | null): Promise<boolean>
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
  deleteSessions(userId: string, exceptId: string | null): Promise<number>
  deleteSession(id: string, userId: string): Promise<void>
  hasActivity(userId: string): Promise<boolean>
  purgeAccount(userId: string): Promise<void>
  careerLocked(careerId: string): Promise<boolean>
  recordAudit(event: AuditEventInput): Promise<void>
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

export class NeedsLaravel extends Error {
  constructor() {
    super("needs-laravel")
  }
}

const invalid = (attribute: string, message: string) => new AccountValidation({ [attribute]: [message] })

const INVITATION_DAYS = 7
export const RESEND = "reenvio"
export const STILL_VALID = "La invitación sigue vigente; podrá reenviarla cuando venza."

async function audit(
  ctx: ActionContext,
  action: string,
  resourceType: string,
  resourceId: string | null,
  metadata: AuditEventInput["metadata"] = {},
  actorId: string = ctx.actorId,
): Promise<void> {
  await ctx.tx.recordAudit({ actorId, roleAssignmentId: ctx.activeRoleId, action, resourceType, resourceId, result: "exito", metadata, occurredAt: ctx.now })
}

export async function issueInvitation(ctx: ActionContext, target: Account, reason: string): Promise<void> {
  const user = await ctx.tx.lockAccount(target.id)
  if (user === null) throw new NeedsLaravel()
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
  await audit(ctx, "usuario.invitacion_activacion_enviada", "usuario", user.id, { reason })
  const grant = await ctx.tx.invitationRole(user.id)
  const roleName = grant === null ? "Usuario" : ROLE_LABELS[grant.role]
  const careerName = grant?.careerLabel ?? null
  const activationUrl = `${ctx.services.frontendUrl().replace(/\/+$/, "")}/activar-cuenta?token=${encodeURIComponent(token)}`
  const mail: QueuedMail = { mailable: "activation", to: user.email, data: { name: user.name, roleName, activationUrl, careerName } }
  ctx.afterCommit(() => ctx.services.queueMail(mail))
}

export async function resendActivation(ctx: ActionContext, target: Account, reason: string = RESEND): Promise<void> {
  const locked = await ctx.tx.lockAccount(target.id)
  if (locked === null) throw new NeedsLaravel()
  if (locked.verified) throw invalid("user", "La cuenta ya fue activada por su titular; no se reenvía una invitación.")
  if (reason === RESEND && (await ctx.tx.hasActiveInvitation(locked.id, ctx.now))) throw invalid("user", STILL_VALID)
  await issueInvitation(ctx, locked, reason)
}

export type RoleRequest = { roleCode: string; careerId: string | null; replaceCoordinator: boolean }

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
      if (await tx.careerHasReviewedSyllabi(careerId)) throw new NeedsLaravel()
      await tx.setGrantActive(holder.grantId, false)
      await audit(ctx, "academico.coordinacion.reemplazada", "carrera", careerId, {
        previous_user_id: holder.userId,
        incoming_user_id: target.id,
        returned_to_review: 0,
      })
    }
  }
  const grant = await tx.findGrant(target.id, role, careerId, false)
  if (grant === null) await tx.insertGrant(target.id, role, careerId, ctx.now)
  else if (!grant.active) await tx.setGrantActive(grant.id, true)
  await audit(ctx, "usuario.rol_asignado", "usuario", target.id, { role, career_id: careerId })
}

export type NewAccount = { name: string; email: string } & RoleRequest

export async function createManagedUser(ctx: ActionContext, data: NewAccount): Promise<Account> {
  const user = await ctx.tx.insertAccount({
    name: normalizeName(data.name),
    email: data.email.toLowerCase(),
    passwordHash: await ctx.services.hashPassword(ctx.services.random(64)),
  })
  await assignRole(ctx, user, data)
  await audit(ctx, "usuario.creado", "usuario", user.id, { initial_role: data.roleCode })
  await issueInvitation(ctx, user, "alta")
  return user
}

export async function revokeSessions(ctx: Pick<ActionContext, "tx" | "services">, userId: string, exceptId: string | null): Promise<number> {
  await ctx.tx.setRememberToken(userId, ctx.services.random(60))
  return ctx.tx.deleteSessions(userId, exceptId)
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
  let closedTeacherAssignments = 0
  const closedCoordinations: string[] = []
  if (!active) {
    await revokeSessions(ctx, target.id, null)
    closedTeacherAssignments = await ctx.tx.closeParallelAssignments(target.id)
    for (const coordination of await ctx.tx.lockEffectiveCoordinations(target.id)) {
      await ctx.tx.setGrantActive(coordination.id, false)
      closedCoordinations.push(coordination.label)
    }
  }
  await audit(ctx, active ? "usuario.activado" : "usuario.desactivado", "usuario", target.id, {
    closed_teacher_assignments: closedTeacherAssignments,
    closed_coordinations: closedCoordinations.join(", "),
  })
}

export async function updateManagedUserProfile(ctx: ActionContext, target: { id: string }, data: { name: string; email: string }): Promise<Account> {
  const locked = await ctx.tx.lockAccount(target.id)
  if (locked === null) throw new NeedsLaravel()
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
  await audit(ctx, "usuario.perfil_actualizado", "usuario", locked.id, {
    previous_name: locked.name,
    previous_email: locked.email,
    name_changed: locked.name !== name,
    email_changed: locked.email !== email,
  })
  const updated = { ...locked, name, email }
  if (locked.email !== email && !locked.verified) await resendActivation(ctx, updated, "correo_corregido")
  return updated
}

export async function removeUserRole(ctx: ActionContext, target: { id: string }, assignment: RoleGrant): Promise<void> {
  const effective = await ctx.tx.lockEffectiveGrants(target.id)
  if (!effective.some((grant) => grant.id === assignment.id)) throw invalid("role", "Ese rol ya no está vigente.")
  if (effective.length === 1) throw invalid("role", "Es el único rol de la cuenta. Deshabilite el acceso en lugar de quitarlo.")
  let removedParallels = 0
  if (assignment.role === ROLE_TEACHER) {
    const parallels = await ctx.tx.lockActiveParallelAssignments(assignment.id)
    for (const id of parallels) await ctx.tx.deleteParallelAssignment(id)
    removedParallels = parallels.length
  }
  await ctx.tx.setGrantActive(assignment.id, false)
  await ctx.tx.deleteSessions(target.id, null)
  await audit(ctx, "usuario.rol_retirado", "usuario", target.id, {
    role: assignment.role,
    career_id: assignment.careerId,
    removed_parallel_assignments: removedParallels,
  })
}

export async function deleteManagedUser(ctx: ActionContext, target: { id: string }): Promise<void> {
  const locked = await ctx.tx.lockAccount(target.id)
  if (locked === null) throw new NeedsLaravel()
  if (locked.verified) throw invalid("user", "La cuenta ya fue activada por su titular. Desactívela en lugar de eliminarla.")
  if (await ctx.tx.hasActivity(locked.id)) throw invalid("user", "La cuenta ya tiene actividad registrada. Desactívela en lugar de eliminarla.")
  await ctx.tx.purgeAccount(locked.id)
  await audit(ctx, "usuario.eliminado", "usuario", target.id, { email: locked.email, name: locked.name })
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
  let current: unknown = error
  while (typeof current === "object" && current !== null) {
    if ((current as { code?: unknown }).code === "23505") return true
    current = (current as { cause?: unknown }).cause
  }
  return false
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
  if (attached) await audit(ctx, "usuario.docente_incorporado", "usuario", user.id, { carrera_id: careerId, cuenta_creada: created })
  if (!user.verified && !(await tx.hasActiveInvitation(user.id, ctx.now))) await issueInvitation(ctx, user, "alta_coordinacion")
  return { created, attached }
}

export async function removeCareerTeacher(ctx: ActionContext, target: { id: string }, careerId: string): Promise<number> {
  const { tx } = ctx
  if (await tx.careerLocked(careerId)) throw invalid("process", "Convocatoria activa")
  const grant = await tx.lockActiveGrant(target.id, ROLE_TEACHER, careerId)
  if (grant === null) throw new NeedsLaravel()
  const parallels = await tx.lockActiveParallelAssignments(grant.id)
  for (const id of parallels) await tx.deleteParallelAssignment(id)
  await tx.setGrantActive(grant.id, false)
  if ((await tx.effectiveRoles(target.id)).length === 0) {
    await revokeSessions(ctx, target.id, null)
    await tx.invalidateInvitations(target.id, ctx.now)
  }
  await audit(ctx, "usuario.docente_retirado", "usuario", target.id, { carrera_id: careerId, removed_parallel_assignments: parallels.length })
  return parallels.length
}

export async function updateTeacherFormation(ctx: ActionContext, userId: string, formation: string): Promise<boolean> {
  const locked = await ctx.tx.lockFormation(userId)
  if (locked === null) throw new NeedsLaravel()
  const value = formation.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "")
  if (locked.formation === value) return false
  await ctx.tx.setFormation(userId, value)
  await audit(ctx, "usuario.formacion_actualizada", "usuario", userId, {}, userId)
  return true
}
