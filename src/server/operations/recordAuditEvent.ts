import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { careerLabelSql } from "../academic/careerLabel"
import { uuid7 } from "../laravel/uuid7"

export type AuditEventInput = {
  actorId: string | null
  roleAssignmentId: string | null
  action: string
  resourceType: string
  resourceId: string | null
  result: string
  metadata: Record<string, string | number | boolean | null>
  occurredAt: number
}

export type SqlExecutor = { execute(query: SQL): Promise<unknown> }

const ROLE_NAMES = sql`case asignacion.rol when 'administrador' then 'Administrador' when 'coordinador' then 'Coordinador'
  when 'docente' then 'Docente' when 'bibliotecario' then 'Bibliotecario' end`

export async function insertAuditEvent(executor: SqlExecutor, event: AuditEventInput): Promise<string> {
  const id = uuid7()
  const metadata = Object.keys(event.metadata).length === 0 ? "[]" : JSON.stringify(event.metadata)
  const actorName = event.actorId === null ? sql`null` : sql`(select nombre_usuario from usuarios where usuario_id = ${event.actorId}::uuid limit 1)`
  const role = event.roleAssignmentId === null ? null : sql`from asignaciones_rol asignacion where asignacion.asignacion_rol_id = ${event.roleAssignmentId}::uuid`
  const roleName = role === null ? sql`null` : sql`(select ${ROLE_NAMES} ${role} limit 1)`
  const careerLabel =
    event.roleAssignmentId === null
      ? sql`null`
      : sql`(select ${careerLabelSql("carrera")} from asignaciones_rol asignacion
          inner join carreras carrera on carrera.carrera_id = asignacion.carrera_id
          where asignacion.asignacion_rol_id = ${event.roleAssignmentId}::uuid limit 1)`
  await executor.execute(sql`insert into eventos_auditoria
      (evento_auditoria_id, usuario_id, actor_nombre, actor_rol, actor_carrera, asignacion_rol_id, accion, tipo_recurso, recurso_id, resultado, detalles, ocurrido_en)
    values (${id}::uuid, ${event.actorId}::uuid, ${actorName}, ${roleName},
      ${careerLabel}, ${event.roleAssignmentId}::uuid, ${event.action}, ${event.resourceType}, ${event.resourceId}::uuid, ${event.result},
      ${metadata}::jsonb, to_timestamp(${event.occurredAt}))`)
  return id
}
