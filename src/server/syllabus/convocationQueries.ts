import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { careerLabelSql } from "../academic/careerLabel"
import { accentMatches, institutionDateSql, uuidList } from "../http/sql"
import type { ConvocationListFilters, ConvocationRepository, ConvocationTx, ProcessListRow } from "./convocations"
import { teacherNamesOf } from "./coordinationReviewQueries"
import { careerIs, SYLLABUS_EXISTS } from "./syllabusSql"
import { rowsOf, syllabusDetails, type Executor } from "./teacherSyllabusQueries"

const PROCESS_OF_CONVOCATION = sql`exists (select 1 from convocatorias_universidad proceso_vigente
  where proceso_vigente.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id)`

function careerConvocation(careerId: string | null, extra: SQL = sql``): SQL {
  return sql`exists (select 1 from convocatorias_carreras where convocatorias_universidad.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id
    and ${careerIs(sql.raw("convocatorias_carreras.carrera_id"), careerId)} ${extra} and ${PROCESS_OF_CONVOCATION})`
}

function listConditions(filters: ConvocationListFilters): SQL {
  const conditions: SQL[] = [sql`1 = 1`]
  if (filters.search !== null) {
    conditions.push(sql`exists (select 1 from periodos_academicos where convocatorias_universidad.periodo_academico_id = periodos_academicos.periodo_academico_id
      and ${accentMatches(sql.raw("codigo_periodo_academico"), filters.search)})`)
  }
  if (filters.state === "sin_iniciar") conditions.push(sql`not ${careerConvocation(filters.careerId)}`)
  else if (filters.state !== null) conditions.push(careerConvocation(filters.careerId, sql`and convocatorias_carreras.estado_convocatoria_carrera = ${filters.state}`))
  return sql.join(conditions, sql` and `)
}

function convocationTx(executor: Executor): ConvocationTx {
  return {
    async lockConvocation(id) {
      const [row] = await rowsOf<{ state: string }>(
        executor,
        sql`select estado_convocatoria_carrera as state from convocatorias_carreras
          where convocatoria_carrera_id = ${id}::uuid and ${PROCESS_OF_CONVOCATION} limit 1 for update`,
      )
      return row?.state ?? null
    },
    async updateState(id, state) {
      await executor.execute(sql`update convocatorias_carreras set estado_convocatoria_carrera = ${state} where convocatoria_carrera_id = ${id}::uuid`)
    },
  }
}

type RevisionRow = { syllabus_id: string; id: string; approved: boolean; verified: boolean; stage: string | null }

export function convocationRepositoryOn(executor: Executor, transaction: <T>(work: (tx: ConvocationTx) => Promise<T>) => Promise<T>): ConvocationRepository {
  return {
    async page(filters, page, perPage) {
      const where = listConditions(filters)
      const [count] = await rowsOf<{ total: string }>(executor, sql`select count(*) as total from convocatorias_universidad where ${where}`)
      const total = Number(count?.total ?? 0)
      if (total === 0) return { total, items: [] }
      const processes = await rowsOf<{ id: string; state: string; period: string }>(
        executor,
        sql`select convocatorias_universidad.convocatoria_universidad_id::text as id, estado_convocatoria_universidad as state,
            (select codigo_periodo_academico from periodos_academicos where periodos_academicos.periodo_academico_id = convocatorias_universidad.periodo_academico_id) as period
          from convocatorias_universidad where ${where} order by fecha_inicio desc limit ${perPage} offset ${(page - 1) * perPage}`,
      )
      const convocations = processes.length === 0 ? [] : await rowsOf<{ process_id: string; id: string; state: string; syllabi_count: string }>(
        executor,
        sql`select convocatorias_carreras.convocatoria_universidad_id::text as process_id, convocatorias_carreras.convocatoria_carrera_id::text as id,
            convocatorias_carreras.estado_convocatoria_carrera as state,
            (select count(*) from silabos where convocatorias_carreras.convocatoria_carrera_id = silabos.convocatoria_carrera_id and ${SYLLABUS_EXISTS}) as syllabi_count
          from convocatorias_carreras where convocatorias_carreras.convocatoria_universidad_id in (${uuidList(processes.map((row) => row.id))})
            and ${careerIs(sql.raw("convocatorias_carreras.carrera_id"), filters.careerId)} and ${PROCESS_OF_CONVOCATION}`,
      )
      const items: ProcessListRow[] = processes.map((process) => {
        const convocation = convocations.find((row) => row.process_id === process.id) ?? null
        return {
          processId: process.id,
          processState: process.state,
          period: process.period,
          convocationId: convocation?.id ?? null,
          convocationState: convocation?.state ?? null,
          syllabiCount: convocation === null ? 0 : Number(convocation.syllabi_count),
        }
      })
      return { total, items }
    },
    async convocation(id) {
      const [row] = await rowsOf<{ id: string; career_id: string; career: string; state: string; process_state: string; period: string; starts_on: string; due_on: string }>(
        executor,
        sql`select convocatoria.convocatoria_carrera_id::text as id, convocatoria.carrera_id::text as career_id, ${careerLabelSql("carrera")} as career,
            convocatoria.estado_convocatoria_carrera as state, proceso.estado_convocatoria_universidad as process_state, periodo.codigo_periodo_academico as period,
            ${institutionDateSql(sql.raw("proceso.fecha_inicio"))} as starts_on, ${institutionDateSql(sql.raw("proceso.fecha_entrega"))} as due_on
          from convocatorias_carreras convocatoria
            inner join convocatorias_universidad proceso on proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id
            inner join periodos_academicos periodo on periodo.periodo_academico_id = proceso.periodo_academico_id
            inner join carreras carrera on carrera.carrera_id = convocatoria.carrera_id
          where convocatoria.convocatoria_carrera_id = ${id}::uuid limit 1`,
      )
      return row
        ? { id: row.id, careerId: row.career_id, career: row.career, state: row.state, processState: row.process_state, period: row.period, startsOn: row.starts_on, dueOn: row.due_on }
        : null
    },
    async syllabi(convocationId) {
      const ids = (
        await rowsOf<{ id: string }>(
          executor,
          sql`select silabos.silabo_id::text as id from silabos where silabos.convocatoria_carrera_id = ${convocationId}::uuid and silabos.convocatoria_carrera_id is not null and ${SYLLABUS_EXISTS}`,
        )
      ).map((row) => row.id)
      if (ids.length === 0) return []
      const details = await syllabusDetails(executor, ids)
      const revisions = await rowsOf<RevisionRow>(
        executor,
        sql`select distinct on (revisiones_silabo.silabo_id) revisiones_silabo.silabo_id::text as syllabus_id, revisiones_silabo.revision_silabo_id::text as id,
            revisiones_silabo.correccion_etapa as stage,
            exists (select 1 from aprobaciones where aprobaciones.revision_silabo_id = revisiones_silabo.revision_silabo_id) as approved,
            exists (select 1 from envios_biblioteca where envios_biblioteca.revision_silabo_id = revisiones_silabo.revision_silabo_id and envios_biblioteca.verificado_en is not null) as verified
          from revisiones_silabo where revisiones_silabo.silabo_id in (${uuidList(ids)})
          order by revisiones_silabo.silabo_id, revisiones_silabo.numero_revision desc`,
      )
      const latest = new Map(revisions.map((row) => [row.syllabus_id, row]))
      const teachers = await teacherNamesOf(executor, ids)
      return details.map((row) => {
        const revision = latest.get(row.id) ?? null
        return {
          id: row.id,
          subject: row.subject,
          code: row.code,
          liveSubject: row.live_subject,
          state: row.state,
          parallel: row.parallel,
          startedAt: row.started_at,
          latestRevision: revision === null ? null : { id: revision.id, stage: { approved: revision.approved, verified: revision.verified }, returnedBy: revision.stage },
          teachers: teachers.get(row.id) ?? [],
        }
      })
    },
    transaction,
  }
}

export function createConvocationRepository(): ConvocationRepository {
  return convocationRepositoryOn(db as unknown as Executor, (work) => db.transaction((tx) => work(convocationTx(tx as unknown as Executor))))
}

export { convocationTx }
