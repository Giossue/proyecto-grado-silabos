import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import { accentMatches, uuidList } from "../../prisma/sql"
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

export type Executor = Db

export function rowsOf<T>(db: Db, query: Prisma.Sql): Promise<T[]> {
  return db.$queryRaw<T[]>(query)
}

export async function syllabusDetails(executor: Executor, ids: string[]): Promise<SyllabusDetailRow[]> {
  if (ids.length === 0) return []
  const found = await rowsOf<SyllabusDetailRow>(executor, Prisma.sql`select ${SYLLABUS_DETAIL_COLUMNS} from silabos ${SYLLABUS_JOINS} where silabos.silabo_id in (${uuidList(ids)})`)
  const byId = new Map(found.map((row) => [row.id, row]))
  return ids.flatMap((id) => (byId.has(id) ? [byId.get(id) as SyllabusDetailRow] : []))
}

export function subjectSearch(search: string): Prisma.Sql {
  return Prisma.sql`(${accentMatches(Prisma.raw("silabos.datos_academicos_silabo->'subject'->>'name'"), search)}
    or ${accentMatches(Prisma.raw("silabos.datos_academicos_silabo->'subject'->>'code'"), search)})`
}

function currentConditions(filters: TeacherPageFilters): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    SYLLABUS_EXISTS,
    convocationWhere(careerIs(Prisma.raw("convocatoria_filtro.carrera_id"), filters.careerId)),
    currentTeacherSql(filters.userId),
    IN_CURRENT_PERIOD,
  ]
  if (filters.search !== null) conditions.push(subjectSearch(filters.search))
  if (filters.state !== null) conditions.push(Prisma.sql`silabos.estado_silabo = ${filters.state}`)
  return Prisma.join(conditions, " and ")
}

const TEACHER_ORDER = Prisma.raw(`COALESCE((silabos.datos_academicos_silabo->'subject'->>'cycle')::int,
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
    careerCode: row.career_code,
    career: row.career,
    subject: row.subject,
    period: row.period,
    periodEndsOn: row.period_ends_on,
    state: row.state,
    parallel: row.parallel,
    savedAt: row.saved_at,
  }
}

export function createTeacherSyllabusRepository(executor: Db): TeacherSyllabusRepository {
  return {
    async page(filters, page, perPage) {
      const where = currentConditions(filters)
      const [count] = await rowsOf<{ total: bigint }>(executor, Prisma.sql`select count(*) as total from silabos where ${where}`)
      const total = Number(count?.total ?? 0)
      if (total === 0) return { total, items: [] }
      const ids = await rowsOf<{ id: string }>(
        executor,
        Prisma.sql`select silabos.silabo_id::text as id from silabos where ${where} order by ${TEACHER_ORDER} limit ${perPage} offset ${(page - 1) * perPage}`,
      )
      return { total, items: (await syllabusDetails(executor, ids.map((row) => row.id))).map(teacherRow) }
    },
    async convocationOpen(careerId) {
      const [row] = await rowsOf<{ found: boolean }>(
        executor,
        Prisma.sql`select exists (select 1 from convocatorias_carreras convocatoria
          where ${careerIs(Prisma.raw("convocatoria.carrera_id"), careerId)} and convocatoria.estado_convocatoria_carrera in ('abierto', 'pausado')
            and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id)) as found`,
      )
      return row?.found === true
    },
    async past(userId, careerId) {
      const conditions: Prisma.Sql[] = [writtenBySql(userId), IN_PAST_PERIOD]
      if (careerId !== null) conditions.push(convocationWhere(Prisma.sql`convocatoria_filtro.carrera_id = ${careerId}::uuid`))
      conditions.push(SYLLABUS_EXISTS)
      const ids = await rowsOf<{ id: string }>(executor, Prisma.sql`select silabos.silabo_id::text as id from silabos where ${Prisma.join(conditions, " and ")}`)
      return (await syllabusDetails(executor, ids.map((row) => row.id))).map(pastRow)
    },
  }
}
