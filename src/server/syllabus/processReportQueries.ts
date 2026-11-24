import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { careerLabelSql } from "../academic/careerLabel"
import { institutionDateSql, uuidList } from "../laravel/sql"
import type { ProcessReportRepository, ReportProcess, ReportRevision } from "./processReport"
import { PARALLEL_CODE, SUBJECT_NAME, SYLLABUS_EXISTS } from "./syllabusSql"
import { rowsOf, type Executor } from "./teacherSyllabusQueries"

type ProcessRow = { id: string; period: string | null; starts_on: string; due_on: string; state: string }

const PROCESS_COLUMNS = sql`proceso.convocatoria_universidad_id::text as id, periodo.codigo_periodo_academico as period,
  ${institutionDateSql(sql.raw("proceso.fecha_inicio"))} as starts_on, ${institutionDateSql(sql.raw("proceso.fecha_entrega"))} as due_on,
  proceso.estado_convocatoria_universidad as state`

const PROCESS_FROM = sql`from convocatorias_universidad proceso left join periodos_academicos periodo on periodo.periodo_academico_id = proceso.periodo_academico_id`

const toProcess = (row: ProcessRow): ReportProcess => ({ id: row.id, period: row.period, startsOn: row.starts_on, dueOn: row.due_on, state: row.state })

export function processReportRepositoryOn(executor: Executor): ProcessReportRepository {
  return {
    async options() {
      const rows = await rowsOf<{ value: string; label: string | null }>(
        executor,
        sql`select proceso.convocatoria_universidad_id::text as value, periodo.codigo_periodo_academico as label ${PROCESS_FROM} order by proceso.fecha_inicio desc`,
      )
      return rows.map((row) => ({ value: row.value, label: row.label ?? "" }))
    },
    async process(id) {
      const [row] = await rowsOf<ProcessRow>(
        executor,
        id === null
          ? sql`select ${PROCESS_COLUMNS} ${PROCESS_FROM} order by proceso.fecha_inicio desc limit 1`
          : sql`select ${PROCESS_COLUMNS} ${PROCESS_FROM} where proceso.convocatoria_universidad_id = ${id}::uuid limit 1`,
      )
      return row ? toProcess(row) : null
    },
    async syllabi(processId) {
      const syllabi = await rowsOf<{ id: string; career: string; state: string; subject: string; parallel: string }>(
        executor,
        sql`select silabos.silabo_id::text as id, ${careerLabelSql("carrera")} as career, silabos.estado_silabo as state, ${SUBJECT_NAME} as subject, ${PARALLEL_CODE} as parallel
          from silabos
            inner join convocatorias_carreras convocatoria on convocatoria.convocatoria_carrera_id = silabos.convocatoria_carrera_id
            inner join carreras carrera on carrera.carrera_id = convocatoria.carrera_id
            left join paralelos paralelo on paralelo.paralelo_id = silabos.paralelo_id
            left join asignaturas asignatura on asignatura.asignatura_id = paralelo.asignatura_id
          where convocatoria.convocatoria_universidad_id = ${processId}::uuid and ${SYLLABUS_EXISTS}`,
      )
      if (syllabi.length === 0) return []
      const ids = syllabi.map((row) => row.id)
      const teachers = await rowsOf<{ syllabus_id: string; name: string }>(
        executor,
        sql`select docentes_vigentes_silabo.silabo_id::text as syllabus_id, usuarios.nombre_usuario as name
          from usuarios inner join docentes_vigentes_silabo on usuarios.usuario_id = docentes_vigentes_silabo.usuario_id
          where docentes_vigentes_silabo.silabo_id in (${uuidList(ids)})`,
      )
      const revisions = await rowsOf<{ syllabus_id: string; number: number; submitted_at: string; stage: string | null; approved_at: string | null }>(
        executor,
        sql`select revisiones_silabo.silabo_id::text as syllabus_id, revisiones_silabo.numero_revision as number,
            extract(epoch from revisiones_silabo.enviado_en)::bigint as submitted_at, revisiones_silabo.correccion_etapa as stage,
            (select extract(epoch from aprobaciones.aprobado_en)::bigint from aprobaciones where aprobaciones.revision_silabo_id = revisiones_silabo.revision_silabo_id limit 1) as approved_at
          from revisiones_silabo where revisiones_silabo.silabo_id in (${uuidList(ids)}) order by revisiones_silabo.numero_revision`,
      )
      return syllabi.map((row) => ({
        career: row.career,
        state: row.state,
        subject: row.subject,
        parallel: row.parallel,
        teachers: teachers.filter((teacher) => teacher.syllabus_id === row.id).map((teacher) => teacher.name),
        revisions: revisions
          .filter((revision) => revision.syllabus_id === row.id)
          .map((revision): ReportRevision => ({
            number: Number(revision.number),
            submittedAt: Number(revision.submitted_at),
            correctionStage: revision.stage,
            approvedAt: revision.approved_at === null ? null : Number(revision.approved_at),
          })),
      }))
    },
  }
}

export function createProcessReportRepository(): ProcessReportRepository {
  return processReportRepositoryOn(db as unknown as Executor)
}
