import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, RoleAssignmentRecord } from "../auth/types"
import { institutionToday } from "../dashboard/dashboardQueries"
import { laravelJson } from "../laravel/responses"

export type UserProfile = {
  name: string
  email: string
  formation: string | null
  accessibility: unknown
  twoFactorSecret: boolean
  twoFactorConfirmed: boolean
}

export interface ProfileRepository {
  find(userId: string): Promise<UserProfile | null>
}

export type SessionDeps = {
  bridge: BridgeDeps
  profiles: ProfileRepository
  today: () => string
  timezone: () => string
}

export function phpArrayCast(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(phpArrayCast)
  if (typeof value !== "object" || value === null) return value
  const entries = Object.entries(value)
  if (entries.every(([key], index) => key === String(index))) return entries.map(([, item]) => phpArrayCast(item))
  return Object.fromEntries(entries.map(([key, item]) => [key, phpArrayCast(item)]))
}

export function createProfileRepository(): ProfileRepository {
  return {
    async find(userId) {
      const [row] = (
        await db.execute(sql`select nombre_usuario, correo_electronico, formacion_experiencia_usuario, preferencias_accesibilidad_usuario,
            secreto_dos_factores is not null as two_factor_secret, dos_factores_confirmado_en is not null as two_factor_confirmed
          from usuarios where usuario_id = ${userId}::uuid`)
      ).rows as {
        nombre_usuario: string
        correo_electronico: string
        formacion_experiencia_usuario: string | null
        preferencias_accesibilidad_usuario: unknown
        two_factor_secret: boolean
        two_factor_confirmed: boolean
      }[]
      if (!row) return null
      return {
        name: row.nombre_usuario,
        email: row.correo_electronico,
        formation: row.formacion_experiencia_usuario,
        accessibility: row.preferencias_accesibilidad_usuario,
        twoFactorSecret: row.two_factor_secret,
        twoFactorConfirmed: row.two_factor_confirmed,
      }
    },
  }
}

function defaultDeps(): SessionDeps {
  return {
    bridge: defaultBridgeDeps(),
    profiles: createProfileRepository(),
    today: institutionToday,
    timezone: () => process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil",
  }
}

function rolePayload(assignment: RoleAssignmentRecord) {
  return { id: assignment.id, code: assignment.role, career_id: assignment.careerId, career_name: assignment.careerLabel }
}

export async function showSession(request: Request, deps: SessionDeps = defaultDeps()): Promise<Response> {
  const session = await requireSession(request, { activeRole: "optional" }, deps.bridge)
  if (session instanceof Response) return session
  const profile = await deps.profiles.find(session.user.id)
  if (profile === null) return deps.bridge.forward(request)
  return laravelJson({
    user: {
      id: session.user.id,
      name: profile.name,
      email: profile.email,
      email_verified: session.user.emailVerifiedAt !== null,
      can_edit_identity: session.activeRole?.role === "administrador",
      formation: profile.formation,
      accessibility: phpArrayCast(profile.accessibility),
    },
    active_role: session.activeRole === null ? null : rolePayload(session.activeRole),
    available_roles: session.eligibleRoles.map(rolePayload),
    institution: { today: deps.today(), timezone: deps.timezone() },
  })
}

export async function twoFactorStatus(request: Request, deps: SessionDeps = defaultDeps()): Promise<Response> {
  const session = await requireSession(request, {}, deps.bridge)
  if (session instanceof Response) return session
  const profile = await deps.profiles.find(session.user.id)
  if (profile === null) return deps.bridge.forward(request)
  return laravelJson({
    enabled: profile.twoFactorSecret && profile.twoFactorConfirmed,
    confirmation_required: profile.twoFactorSecret && !profile.twoFactorConfirmed,
  })
}
