import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { accentMatches, uuidList } from "../http/sql"
import type { PastSyllabusRow, TeacherPageFilters, TeacherSyllabusRepository, TeacherSyllabusRow } from "./teacherSyllabi"
import {
  careerIs,
  convocationWhere,
  currentTeacherSql,
  IN_CURRENT_PERIOD,
  IN_PAST_PERIOD,
  SYLLABUS_DETAIL_COLUMNS,
  SYLLABUS_EXISTS,
  SYLLABUS_JOINS,
  writtenBySql,
  type SyllabusDetailRow,
} from "./syllabusSql"

export type { Executor } from "@/db"
import type { Executor } from "@/db"

export async function rowsOf<T>(executor: Executor, query: SQL): Promise<T[]> {
  return (await executor.execute(query)).rows as T[]
}

export async function syllabusDetails(executor: Executor, ids: string[]): Promise<SyllabusDetailRow[]> {
  if (ids.length === 0) return []
  const found = await rowsOf<SyllabusDetailRow>(executor, sql`select ${SYLLABUS_DETAIL_COLUMNS} from silabos ${SYLLABUS_JOINS} where silabos.silabo_id in (${uuidList(ids)})`)
  const byId = new Map(found.map((row) => [row.id, row]))
  return ids.flatMap((id) => (byId.has(id) ? [byId.get(id) as SyllabusDetailRow] : []))
}

export function subjectSearch(search: string): SQL {
  return sql`(${accentMatches(sql.raw("silabos.datos_academicos_silabo->'subject'->>'name'"), search)}
    or ${accentMatches(sql.raw("silabos.datos_academicos_silabo->'subject'->>'code'"), search)})`
}

function currentConditions(filters: TeacherPageFilters): SQL {
  const conditions: SQL[] = [
    SYLLABUS_EXISTS,
    convocationWhere(careerIs(sql.raw("convocatoria_filtro.carrera_id"), filters.careerId)),
    currentTeacherSql(filters.userId),
    IN_CURRENT_PERIOD,
  ]
  if (filters.search !== null) conditions.push(subjectSearch(filters.search))
  if (filters.state !== null) conditions.push(sql`silabos.estado_silabo = ${filters.state}`)
  return sql.join(conditions, sql` and `)
}

const TEACHER_ORDER = sql.raw(`COALESCE((silabos.datos_academicos_silabo->'subject'->>'cycle')::int,
    (SELECT a.ciclo_asignatura FROM paralelos p JOIN asignaturas a ON a.asignatura_id = p.asignatura_id WHERE p.paralelo_id = silabos.paralelo_id)) NULLS LAST,
  COALESCE(silabos.datos_academicos_silabo->'subject'->>'name',
    (SELECT a.nombre_asignatura FROM paralelos p JOIN asignaturas a ON a.asignatura_id = p.asignatura_id WHERE p.paralelo_id = silabos.paralelo_id)),
  silabos.silabo_id asc`)

function teacherRow(row: SyllabusDetailRow): TeacherSyllabusRow {
  return {
    id: row.id,
    subject: row.subject,
    code: row.code,
    career: row.career,
    period: row.period,
    state: row.state,
    startedAt: row.started_at,
    parallel: row.parallel,
    savedAt: row.saved_at,
  }
}

function pastRow(row: SyllabusDetailRow): PastSyllabusRow {
  return {
    id: row.id,
    careerId: row.career_id,
    career: row.career,
    subject: row.subject,
    period: row.period,
    periodEndsOn: row.period_ends_on,
    state: row.state,
    parallel: row.parallel,
    savedAt: row.saved_at,
  }
}

export function createTeacherSyllabusRepository(executor: Executor = db as unknown as Executor): TeacherSyllabusRepository {
  return {
    async page(filters, page, perPage) {
      const where = currentConditions(filters)
      const [count] = await rowsOf<{ total: string }>(executor, sql`select count(*) as total from silabos where ${where}`)
      const total = Number(count?.total ?? 0)
      if (total === 0) return { total, items: [] }
      const ids = await rowsOf<{ id: string }>(
        executor,
        sql`select silabos.silabo_id::text as id from silabos where ${where} order by ${TEACHER_ORDER} limit ${perPage} offset ${(page - 1) * perPage}`,
      )
      return { total, items: (await syllabusDetails(executor, ids.map((row) => row.id))).map(teacherRow) }
    },
    async convocationOpen(careerId) {
      const [row] = await rowsOf<{ found: boolean }>(
        executor,
        sql`select exists (select 1 from convocatorias_carreras convocatoria
          where ${careerIs(sql.raw("convocatoria.carrera_id"), careerId)} and convocatoria.estado_convocatoria_carrera in ('abierta', 'pausada')
            and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id)) as found`,
      )
      return row?.found === true
    },
    async past(userId, careerId) {
      const conditions: SQL[] = [writtenBySql(userId), IN_PAST_PERIOD]
      if (careerId !== null) conditions.push(convocationWhere(sql`convocatoria_filtro.carrera_id = ${careerId}::uuid`))
      conditions.push(SYLLABUS_EXISTS)
      const ids = await rowsOf<{ id: string }>(executor, sql`select silabos.silabo_id::text as id from silabos where ${sql.join(conditions, sql` and `)}`)
      return (await syllabusDetails(executor, ids.map((row) => row.id))).map(pastRow)
    },
  }
}
