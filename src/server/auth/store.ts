import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import type { RoleAssignmentRecord, SessionRecord, SessionStore, SessionUser } from "./types"

type Row = Record<string, unknown>

export type SessionExecutor = { execute(query: SQL): Promise<{ rows: unknown[]; rowCount?: number | null }> }

export function createSessionStore(): SessionStore {
  return sessionStoreOn(db as unknown as SessionExecutor)
}

export function sessionStoreOn(executor: SessionExecutor): SessionStore {
  const rows = async <T extends Row>(query: SQL): Promise<T[]> => (await executor.execute(query)).rows as T[]
  return {
    async findSession(id) {
      const [row] = await rows<{ payload: string; last_activity: number }>(
        sql`select payload, last_activity from sesiones where id = ${id} limit 1`,
      )
      return row ? ({ payload: row.payload, lastActivity: Number(row.last_activity) } satisfies SessionRecord) : null
    },
    async findUser(id) {
      const [row] = await rows<{
        usuario_id: string
        contrasena: string
        usuario_activo: boolean
        correo_verificado_en: string | null
        preferencias_correo_usuario: unknown
      }>(sql`select usuario_id, contrasena, usuario_activo, correo_verificado_en::text as correo_verificado_en,
               preferencias_correo_usuario
             from usuarios where usuario_id = ${id} limit 1`)
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
    async touchSession(id, lastActivity) {
      await executor.execute(sql`update sesiones set last_activity = ${lastActivity} where id = ${id}`)
    },
    async insertSession(id, row) {
      const result = await executor.execute(sql`insert into sesiones (payload, last_activity, user_id, ip_address, user_agent, id)
        values (${row.payload}, ${row.lastActivity}, ${row.userId}::uuid, ${row.ipAddress}, ${row.userAgent}, ${id})
        on conflict (id) do nothing`)
      return (result.rowCount ?? 0) > 0
    },
    async updateSession(id, row) {
      await executor.execute(sql`update sesiones set payload = ${row.payload}, last_activity = ${row.lastActivity}, user_id = ${row.userId}::uuid,
        ip_address = ${row.ipAddress}, user_agent = ${row.userAgent} where id = ${id}`)
    },
    async destroySession(id) {
      await executor.execute(sql`delete from sesiones where id = ${id}`)
    },
    async collectGarbage(threshold) {
      await executor.execute(sql`delete from sesiones where last_activity <= ${threshold}`)
    },
  }
}
