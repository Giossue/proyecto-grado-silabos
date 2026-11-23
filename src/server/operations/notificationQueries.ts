import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import type { NotificationRecord, NotificationRepository } from "./notifications"
import type { DestinationLookups } from "./notificationDestination"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INSTITUTION_TIMEZONE = process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil"

async function rows<T>(query: SQL): Promise<T[]> {
  const result = await db.execute(query)
  return result.rows as T[]
}

const iso8601 = (column: SQL) => sql`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"')`

function visibleTo(userId: string): SQL {
  return sql`n.usuario_id = ${userId} and (
    n.periodo_academico_id in (
      select cu.periodo_academico_id from convocatorias_universidad cu
      where cu.convocatoria_universidad_id = (
        select latest.convocatoria_universidad_id from convocatorias_universidad latest
        order by latest.fecha_inicio desc, latest.convocatoria_universidad_id desc limit 1
      )
    )
    or (
      n.periodo_academico_id not in (select any_process.periodo_academico_id from convocatorias_universidad any_process)
      and n.periodo_academico_id in (
        select p.periodo_academico_id from periodos_academicos p
        where p.fecha_fin_periodo::date >= (now() at time zone ${INSTITUTION_TIMEZONE})::date
      )
    )
  )`
}

type NotificationRow = {
  notificacion_id: string
  tipo_notificacion: string
  titulo_notificacion: string
  mensaje_notificacion: string
  tipo_recurso: string | null
  recurso_id: string | null
  leido_en: string | null
  notificado_en: string
}

export function createNotificationRepository(): NotificationRepository {
  return {
    async page(userId, { page, perPage, onlyUnread }) {
      const where = onlyUnread ? sql`${visibleTo(userId)} and n.leido_en is null` : visibleTo(userId)
      const [{ total }] = await rows<{ total: string }>(sql`select count(*) as total from notificaciones n where ${where}`)
      const count = Number(total)
      if (count === 0) return { total: 0, items: [] }
      const found = await rows<NotificationRow>(sql`
        select n.notificacion_id, n.tipo_notificacion, n.titulo_notificacion, n.mensaje_notificacion, n.tipo_recurso,
               n.recurso_id::text as recurso_id, ${iso8601(sql`n.leido_en`)} as leido_en, ${iso8601(sql`n.notificado_en`)} as notificado_en
        from notificaciones n
        where ${where}
        order by n.notificado_en desc
        limit ${perPage} offset ${(page - 1) * perPage}`)
      return {
        total: count,
        items: found.map(
          (row): NotificationRecord => ({
            id: row.notificacion_id,
            type: row.tipo_notificacion,
            title: row.titulo_notificacion,
            message: row.mensaje_notificacion,
            resourceType: row.tipo_recurso,
            resourceId: row.recurso_id,
            readAt: row.leido_en,
            notifiedAt: row.notificado_en,
          }),
        ),
      }
    },
    async unreadCount(userId) {
      const [{ total }] = await rows<{ total: string }>(
        sql`select count(*) as total from notificaciones n where ${visibleTo(userId)} and n.leido_en is null`,
      )
      return Number(total)
    },
  }
}

const visibleConvocation = sql`exists (select 1 from convocatorias_universidad cu where cu.convocatoria_universidad_id = cc.convocatoria_universidad_id)`
const visibleSyllabus = sql`exists (select 1 from convocatorias_carreras cc where cc.convocatoria_carrera_id = s.convocatoria_carrera_id and ${visibleConvocation})`

async function strings(query: SQL): Promise<string[]> {
  return (await rows<{ value: string | null }>(query)).map((row) => row.value).filter((value): value is string => typeof value === "string")
}

async function firstString(query: SQL): Promise<string | null> {
  return (await strings(query))[0] ?? null
}

export function createDestinationLookups(): DestinationLookups {
  return {
    async processCareerIds(processId) {
      if (!UUID.test(processId)) return []
      return strings(sql`select cc.carrera_id::text as value from convocatorias_carreras cc
        where cc.convocatoria_universidad_id = ${processId} and ${visibleConvocation}`)
    },
    async convocationCareerIds(convocationId) {
      if (!UUID.test(convocationId)) return []
      return strings(sql`select cc.carrera_id::text as value from convocatorias_carreras cc
        where cc.convocatoria_carrera_id = ${convocationId} and ${visibleConvocation}`)
    },
    async syllabusExists(syllabusId) {
      if (!UUID.test(syllabusId)) return false
      return (await strings(sql`select s.silabo_id::text as value from silabos s where s.silabo_id = ${syllabusId} and ${visibleSyllabus}`)).length > 0
    },
    async syllabusCareerId(syllabusId) {
      if (!UUID.test(syllabusId)) return null
      return firstString(sql`select cc.carrera_id::text as value from silabos s
        join convocatorias_carreras cc on cc.convocatoria_carrera_id = s.convocatoria_carrera_id
        where s.silabo_id = ${syllabusId} and ${visibleSyllabus} and ${visibleConvocation} limit 1`)
    },
    async latestRevisionId(syllabusId) {
      if (!UUID.test(syllabusId)) return null
      return firstString(sql`select r.revision_silabo_id::text as value from revisiones_silabo r
        join silabos s on s.silabo_id = r.silabo_id
        where r.silabo_id = ${syllabusId} and ${visibleSyllabus}
        order by r.numero_revision desc limit 1`)
    },
    async teacherAssignmentIds(syllabusId, userId) {
      if (!UUID.test(syllabusId)) return []
      return strings(sql`select d.asignacion_rol_id::text as value from docentes_vigentes_silabo d
        where d.silabo_id = ${syllabusId} and d.usuario_id = ${userId}`)
    },
    async artifactRevision(artifactId) {
      if (!UUID.test(artifactId)) return null
      const [row] = await rows<{ revision_id: string; syllabus_id: string }>(sql`
        select r.revision_silabo_id::text as revision_id, s.silabo_id::text as syllabus_id
        from exportaciones_silabo e
        join revisiones_silabo r on r.revision_silabo_id = e.revision_silabo_id
        join silabos s on s.silabo_id = r.silabo_id
        where e.exportacion_silabo_id = ${artifactId} and ${visibleSyllabus} limit 1`)
      return row ? { revisionId: row.revision_id, syllabusId: row.syllabus_id } : null
    },
  }
}
