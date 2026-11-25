import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { careerLabelSql } from "../academic/careerLabel"
import { accentMatches, uuidList } from "../http/sql"
import { rowsOf, type Executor } from "../syllabus/teacherSyllabusQueries"
import type { ManagedUserFilters, ManagedUserRepository, ManagedUserRow } from "./managedUsers"

function conditions(filters: ManagedUserFilters): SQL {
  const where: SQL[] = [sql`true`]
  if (filters.search !== null) {
    where.push(sql`(${accentMatches(sql.raw("nombre_usuario"), filters.search)} or ${accentMatches(sql.raw("correo_electronico"), filters.search)})`)
  }
  if (filters.status === "active") where.push(sql`usuario_activo = true and correo_verificado_en is not null`)
  if (filters.status === "pending") where.push(sql`usuario_activo = true and correo_verificado_en is null`)
  if (filters.status === "inactive") where.push(sql`usuario_activo = false`)
  if (filters.role !== null) {
    where.push(sql`usuario_id in (select usuario_id from asignaciones_rol where asignacion_rol_activa = true and rol = ${filters.role})`)
  }
  if (filters.career !== null) {
    where.push(sql`usuario_id in (select usuario_id from asignaciones_rol where asignacion_rol_activa = true and carrera_id = ${filters.career}::uuid)`)
  }
  return sql.join(where, sql` and `)
}

type UserRow = { id: string; name: string; email: string; active: boolean; verified: boolean; two_factor: boolean; invitation: boolean }
type AssignmentRow = { user_id: string; id: string; role: string; career: string | null; active: boolean }

export function managedUserRepositoryOn(executor: Executor): ManagedUserRepository {
  return {
    async page(filters, page, perPage) {
      const where = conditions(filters)
      const [{ total }] = await rowsOf<{ total: string }>(executor, sql`select count(*) as total from usuarios where ${where}`)
      if (Number(total) === 0) return { total: 0, items: [] }
      const users = await rowsOf<UserRow>(
        executor,
        sql`select usuario_id::text as id, nombre_usuario as name, correo_electronico as email, usuario_activo as active,
            correo_verificado_en is not null as verified, dos_factores_confirmado_en is not null as two_factor,
            exists (select 1 from invitaciones_activacion where invitaciones_activacion.usuario_id = usuarios.usuario_id
              and usada_en is null and invalidada_en is null and expira_en > now()) as invitation
          from usuarios where ${where} order by nombre_usuario asc limit ${perPage} offset ${(page - 1) * perPage}`,
      )
      const assignments =
        users.length === 0
          ? []
          : await rowsOf<AssignmentRow>(
              executor,
              sql`select asignaciones_rol.usuario_id::text as user_id, asignaciones_rol.asignacion_rol_id::text as id, asignaciones_rol.rol as role,
                  case when carrera.carrera_id is null then null else ${careerLabelSql("carrera")} end as career, asignaciones_rol.asignacion_rol_activa as active
                from asignaciones_rol left join carreras carrera on carrera.carrera_id = asignaciones_rol.carrera_id
                where asignaciones_rol.usuario_id in (${uuidList(users.map((user) => user.id))}) order by asignaciones_rol.asignado_en desc`,
            )
      return {
        total: Number(total),
        items: users.map(
          (user): ManagedUserRow => ({
            id: user.id,
            name: user.name,
            email: user.email,
            active: user.active,
            verified: user.verified,
            twoFactor: user.two_factor,
            invitationActive: user.invitation,
            assignments: assignments
              .filter((assignment) => assignment.user_id === user.id)
              .map((assignment) => ({ id: assignment.id, role: assignment.role, careerLabel: assignment.career, active: assignment.active })),
          }),
        ),
      }
    },
    async careers() {
      return rowsOf<{ id: string; nombre: string }>(
        executor,
        sql`select carrera.carrera_id::text as id, ${careerLabelSql("carrera")} as nombre from carreras carrera
          where carrera.carrera_activa = true order by carrera.nombre_carrera asc, carrera.codigo_carrera asc`,
      )
    },
  }
}

export function createManagedUserRepository(): ManagedUserRepository {
  return managedUserRepositoryOn(db as unknown as Executor)
}
