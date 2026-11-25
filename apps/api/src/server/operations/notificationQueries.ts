import { and, count, desc, eq, isNull, sql, type SQL } from "drizzle-orm"
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core"
import { db } from "@/db"
import { fromEpoch, hasRows, isoText } from "@/db/expressions"
import { convocatoriasCarreras, docentesVigentesSilabo, exportacionesSilabo, notificaciones, revisionesSilabo, silabos } from "@/db/schema"
import type { NotificationRecord, NotificationRepository, NotificationWriteRepository, StoredNotification } from "./notifications"
import type { DestinationLookups } from "./notificationDestination"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INSTITUTION_TIMEZONE = process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil"

const n = alias(notificaciones, "n")
const cc = alias(convocatoriasCarreras, "cc")
const syllabus = alias(silabos, "s")

function visibleTo(table: { usuarioId: AnyPgColumn; periodoAcademicoId: AnyPgColumn }, userId: string): SQL {
  return sql`${table.usuarioId} = ${userId} and (
    ${table.periodoAcademicoId} in (
      select cu.periodo_academico_id from convocatorias_universidad cu
      where cu.convocatoria_universidad_id = (
        select latest.convocatoria_universidad_id from convocatorias_universidad latest
        order by latest.fecha_inicio desc, latest.convocatoria_universidad_id desc limit 1
      )
    )
    or (
      ${table.periodoAcademicoId} not in (select any_process.periodo_academico_id from convocatorias_universidad any_process)
      and ${table.periodoAcademicoId} in (
        select p.periodo_academico_id from periodos_academicos p
        where p.fecha_fin_periodo::date >= (now() at time zone ${INSTITUTION_TIMEZONE})::date
      )
    )
  )`
}

function visible(userId: string, onlyUnread: boolean): SQL | undefined {
  return and(visibleTo(n, userId), onlyUnread ? isNull(n.leidoEn) : undefined)
}

async function visibleCount(where: SQL | undefined): Promise<number> {
  const [row] = await db.select({ total: count() }).from(n).where(where)
  return row?.total ?? 0
}

export function createNotificationRepository(): NotificationRepository {
  return {
    async page(userId, { page, perPage, onlyUnread }) {
      const where = visible(userId, onlyUnread)
      const total = await visibleCount(where)
      if (total === 0) return { total: 0, items: [] }
      const found = await db
        .select({
          id: n.notificacionId,
          type: n.tipoNotificacion,
          title: n.tituloNotificacion,
          message: n.mensajeNotificacion,
          resourceType: n.tipoRecurso,
          resourceId: n.recursoId,
          readAt: isoText(n.leidoEn) as SQL<string | null>,
          notifiedAt: isoText(n.notificadoEn),
        })
        .from(n)
        .where(where)
        .orderBy(desc(n.notificadoEn))
        .limit(perPage)
        .offset((page - 1) * perPage)
      return { total, items: found.map((row): NotificationRecord => row) }
    },
    unreadCount: (userId) => visibleCount(visible(userId, true)),
  }
}

export function createNotificationWriteRepository(): NotificationWriteRepository {
  return {
    async find(id) {
      const [row] = await db
        .select({
          id: notificaciones.notificacionId,
          userId: notificaciones.usuarioId,
          type: notificaciones.tipoNotificacion,
          resourceType: notificaciones.tipoRecurso,
          resourceId: notificaciones.recursoId,
          readAt: notificaciones.leidoEn,
        })
        .from(notificaciones)
        .where(eq(notificaciones.notificacionId, id))
        .limit(1)
      return row ? (row satisfies StoredNotification) : null
    },
    async markRead(id, at) {
      await db.update(notificaciones).set({ leidoEn: fromEpoch(at) }).where(eq(notificaciones.notificacionId, id))
    },
    async markAllRead(userId, at) {
      await db
        .update(notificaciones)
        .set({ leidoEn: fromEpoch(at) })
        .where(and(visibleTo(notificaciones, userId), isNull(notificaciones.leidoEn)))
    },
  }
}

const visibleConvocation = sql`exists (select 1 from convocatorias_universidad cu where cu.convocatoria_universidad_id = cc.convocatoria_universidad_id)`
const visibleSyllabus = sql`exists (select 1 from convocatorias_carreras cc where cc.convocatoria_carrera_id = s.convocatoria_carrera_id and ${visibleConvocation})`

async function strings(query: PromiseLike<{ value: string | null }[]>): Promise<string[]> {
  return (await query).map((row) => row.value).filter((value): value is string => typeof value === "string")
}

async function firstString(query: PromiseLike<{ value: string | null }[]>): Promise<string | null> {
  return (await strings(query))[0] ?? null
}

export function createDestinationLookups(): DestinationLookups {
  return {
    async processCareerIds(processId) {
      if (!UUID.test(processId)) return []
      return strings(
        db
          .select({ value: cc.carreraId })
          .from(cc)
          .where(and(eq(cc.convocatoriaUniversidadId, processId), visibleConvocation)),
      )
    },
    async convocationCareerIds(convocationId) {
      if (!UUID.test(convocationId)) return []
      return strings(
        db
          .select({ value: cc.carreraId })
          .from(cc)
          .where(and(eq(cc.convocatoriaCarreraId, convocationId), visibleConvocation)),
      )
    },
    async syllabusExists(syllabusId) {
      if (!UUID.test(syllabusId)) return false
      return hasRows(
        db
          .select({ value: syllabus.silaboId })
          .from(syllabus)
          .where(and(eq(syllabus.silaboId, syllabusId), visibleSyllabus)),
      )
    },
    async syllabusCareerId(syllabusId) {
      if (!UUID.test(syllabusId)) return null
      return firstString(
        db
          .select({ value: cc.carreraId })
          .from(syllabus)
          .innerJoin(cc, eq(cc.convocatoriaCarreraId, syllabus.convocatoriaCarreraId))
          .where(and(eq(syllabus.silaboId, syllabusId), visibleSyllabus, visibleConvocation))
          .limit(1),
      )
    },
    async latestRevisionId(syllabusId) {
      if (!UUID.test(syllabusId)) return null
      const revision = alias(revisionesSilabo, "r")
      return firstString(
        db
          .select({ value: revision.revisionSilaboId })
          .from(revision)
          .innerJoin(syllabus, eq(syllabus.silaboId, revision.silaboId))
          .where(and(eq(revision.silaboId, syllabusId), visibleSyllabus))
          .orderBy(desc(revision.numeroRevision))
          .limit(1),
      )
    },
    async teacherAssignmentIds(syllabusId, userId) {
      if (!UUID.test(syllabusId)) return []
      return strings(
        db
          .select({ value: docentesVigentesSilabo.asignacionRolId })
          .from(docentesVigentesSilabo)
          .where(and(eq(docentesVigentesSilabo.silaboId, syllabusId), eq(docentesVigentesSilabo.usuarioId, userId))),
      )
    },
    async artifactRevision(artifactId) {
      if (!UUID.test(artifactId)) return null
      const [row] = await db
        .select({ revisionId: revisionesSilabo.revisionSilaboId, syllabusId: syllabus.silaboId })
        .from(exportacionesSilabo)
        .innerJoin(revisionesSilabo, eq(revisionesSilabo.revisionSilaboId, exportacionesSilabo.revisionSilaboId))
        .innerJoin(syllabus, eq(syllabus.silaboId, revisionesSilabo.silaboId))
        .where(and(eq(exportacionesSilabo.exportacionSilaboId, artifactId), visibleSyllabus))
        .limit(1)
      return row ?? null
    },
  }
}
