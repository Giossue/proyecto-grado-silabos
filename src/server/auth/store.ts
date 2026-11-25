import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import type { RoleAssignmentRecord, SessionStore, SessionUser } from "./types"

type Row = Record<string, unknown>

export type SessionExecutor = { execute(query: SQL): Promise<{ rows: unknown[]; rowCount?: number | null }> }

export function createSessionStore(): SessionStore {
  return sessionStoreOn(db as unknown as SessionExecutor)
}

export function sessionStoreOn(executor: SessionExecutor): SessionStore {
  const rows = async <T extends Row>(query: SQL): Promise<T[]> => (await executor.execute(query)).rows as T[]
  return {
    async findUser(id) {
      const [row] = await rows<{
        usuario_id: string
        contrasena: string
        usuario_activo: boolean
        correo_verificado_en: string | null
        preferencias_correo_usuario: unknown
      }>(sql`select u.usuario_id, coalesce(c.password, u.contrasena) as contrasena, u.usuario_activo,
               u.correo_verificado_en::text as correo_verificado_en, u.preferencias_correo_usuario
             from usuarios u
             left join cuentas_usuario c on c.user_id = u.usuario_id and c.provider_id = 'credential'
             where u.usuario_id = ${id} limit 1`)
      if (!row) return null
      return {
        id: row.usuario_id,
        passwordHash: row.contrasena,
        active: row.usuario_activo,
        emailVerifiedAt: row.correo_verificado_en,
        emailPreferences: row.preferencias_correo_usuario,
      } satisfies SessionUser
    },
    async effectiveRoleAssignments(userId) {
      const result = await rows<{
        asignacion_rol_id: string
        usuario_id: string
        rol: string
        carrera_id: string | null
        career_label: string | null
      }>(sql`select a.asignacion_rol_id, a.usuario_id, a.rol, a.carrera_id,
               case
                 when c.carrera_id is null then null
                 when (select count(*) from carreras same where same.nombre_carrera = c.nombre_carrera) > 1
                   then c.nombre_carrera || ' · ' || c.codigo_carrera
                 else c.nombre_carrera
               end as career_label
             from asignaciones_rol a
             left join carreras c on c.carrera_id = a.carrera_id
             where a.usuario_id = ${userId} and a.asignacion_rol_activa = true
             order by a.asignado_en asc, a.asignacion_rol_id asc`)
      return result.map(
        (row): RoleAssignmentRecord => ({
          id: row.asignacion_rol_id,
          userId: row.usuario_id,
          role: row.rol,
          careerId: row.carrera_id,
          careerLabel: row.career_label,
        }),
      )
    },
  }
}
