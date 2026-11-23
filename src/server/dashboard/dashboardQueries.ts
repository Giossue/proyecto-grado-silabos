import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { libraryReviewCounts } from "../library/reviewQueries"
import type { ConvocationRecord, DashboardRepository, ProcessRecord, TeacherSyllabus } from "./dashboard"

const institutionTimezone = () => process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil"

export function institutionToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: institutionTimezone(), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
}

type ProcessRow = { id: string; state: string; period: string; starts_on: string; due_on: string; period_ends_on: string }

async function rows<T>(query: SQL): Promise<T[]> {
  return (await db.execute(query)).rows as T[]
}

const localDate = (column: string) => sql`to_char(${sql.raw(column)} at time zone ${institutionTimezone()}, 'YYYY-MM-DD')`

const PROCESS_COLUMNS = sql`proceso.convocatoria_universidad_id::text as id, proceso.estado_convocatoria_universidad as state,
  periodo.codigo_periodo_academico as period, ${localDate("proceso.fecha_inicio")} as starts_on, ${localDate("proceso.fecha_entrega")} as due_on,
  to_char(periodo.fecha_fin_periodo, 'YYYY-MM-DD') as period_ends_on`

const PROCESS_FROM = sql`from convocatorias_universidad proceso
  inner join periodos_academicos periodo on periodo.periodo_academico_id = proceso.periodo_academico_id`

function toProcess(row: ProcessRow): ProcessRecord {
  return { id: row.id, state: row.state, period: row.period, startsOn: row.starts_on, dueOn: row.due_on, periodEndsOn: row.period_ends_on }
}

const CURRENT_TEACHER = (userId: string) => sql`exists (select 1 from docentes_vigentes_silabo docente
  inner join usuarios usuario on usuario.usuario_id = docente.usuario_id
  where docente.silabo_id = silabo.silabo_id and docente.usuario_id = ${userId}::uuid and usuario.usuario_activo = true)`

async function inProgressProcess(): Promise<ProcessRecord | null> {
  const [row] = await rows<ProcessRow>(sql`select ${PROCESS_COLUMNS} ${PROCESS_FROM}
    where proceso.estado_convocatoria_universidad in ('abierto', 'pausado') limit 1`)
  return row ? toProcess(row) : null
}

export function createDashboardRepository(): DashboardRepository {
  return {
    inProgressProcess,
    async latestProcess() {
      const current = await inProgressProcess()
      if (current !== null) return current
      const [row] = await rows<ProcessRow>(sql`select ${PROCESS_COLUMNS} ${PROCESS_FROM} order by periodo.fecha_inicio_periodo desc limit 1`)
      return row ? toProcess(row) : null
    },
    async convocation(careerId, processId): Promise<ConvocationRecord | null> {
      const [row] = await rows<ConvocationRecord>(sql`select convocatoria.convocatoria_carrera_id::text as id, convocatoria.estado_convocatoria_carrera as state
        from convocatorias_carreras convocatoria
        where convocatoria.carrera_id = ${careerId}::uuid and convocatoria.convocatoria_universidad_id = ${processId}::uuid
          and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id)
        limit 1`)
      return row ?? null
    },
    async teacherOpenSyllabi(userId, careerId): Promise<TeacherSyllabus[]> {
      const career = careerId === null ? sql`` : sql` and convocatoria.carrera_id = ${careerId}::uuid`
      const found = await rows<ProcessRow & { convocation_id: string; convocation_state: string; due_epoch: string }>(sql`select ${PROCESS_COLUMNS},
          convocatoria.convocatoria_carrera_id::text as convocation_id, convocatoria.estado_convocatoria_carrera as convocation_state,
          extract(epoch from proceso.fecha_entrega)::bigint::text as due_epoch
        from silabos silabo
        inner join convocatorias_carreras convocatoria on convocatoria.convocatoria_carrera_id = silabo.convocatoria_carrera_id
        inner join convocatorias_universidad proceso on proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id
        inner join periodos_academicos periodo on periodo.periodo_academico_id = proceso.periodo_academico_id
        where silabo.estado_silabo != 'aprobado' and ${CURRENT_TEACHER(userId)}${career}
          and proceso.estado_convocatoria_universidad in ('abierto', 'pausado')`)
      return found.map((row) => ({
        convocation: { id: row.convocation_id, state: row.convocation_state },
        process: toProcess(row),
        dueAt: Number(row.due_epoch),
      }))
    },
    async finalizedTeacherConvocation(userId, processId, careerId): Promise<ConvocationRecord | null> {
      const career = careerId === null ? sql`` : sql` and convocatoria.carrera_id = ${careerId}::uuid`
      const [row] = await rows<ConvocationRecord>(sql`select convocatoria.convocatoria_carrera_id::text as id, convocatoria.estado_convocatoria_carrera as state
        from silabos silabo
        inner join convocatorias_carreras convocatoria on convocatoria.convocatoria_carrera_id = silabo.convocatoria_carrera_id
        inner join convocatorias_universidad proceso on proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id
        where ${CURRENT_TEACHER(userId)} and convocatoria.convocatoria_universidad_id = ${processId}::uuid${career}
        limit 1`)
      return row ?? null
    },
    libraryCounts: libraryReviewCounts,
  }
}
