import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { iso8601, uuidList } from "../laravel/sql"
import { phpJsonDecode } from "../configuration/phpValues"
import type { CoordinationReviewRepository, HistoryFilters, HistoryRow, ReviewListRow } from "./coordinationReviews"
import { syllabusFacts } from "./draftFieldStore"
import { careerIs, convocationWhere, IN_CURRENT_PERIOD, IN_PAST_PERIOD, SYLLABUS_EXISTS } from "./syllabusSql"
import { rowsOf, subjectSearch, syllabusDetails, type Executor } from "./teacherSyllabusQueries"

const REVISION_EXISTS = sql`exists (select 1 from silabos silabo_revision where silabo_revision.silabo_id = revisiones_silabo.silabo_id
  and exists (select 1 from convocatorias_carreras convocatoria_revision where convocatoria_revision.convocatoria_carrera_id = silabo_revision.convocatoria_carrera_id
    and exists (select 1 from convocatorias_universidad proceso_revision where proceso_revision.convocatoria_universidad_id = convocatoria_revision.convocatoria_universidad_id)))`

function reviewConditions(filters: { careerId: string | null; search: string }): SQL {
  const conditions: SQL[] = [
    convocationWhere(careerIs(sql.raw("convocatoria_filtro.carrera_id"), filters.careerId)),
    sql`exists (select 1 from revisiones_silabo where silabos.silabo_id = revisiones_silabo.silabo_id and ${REVISION_EXISTS})`,
    IN_CURRENT_PERIOD,
    SYLLABUS_EXISTS,
    sql`silabos.estado_silabo = 'en_revision'`,
    sql`exists (select 1 from revisiones_silabo where silabos.silabo_id = revisiones_silabo.silabo_id
      and exists (select 1 from envios_biblioteca where revisiones_silabo.revision_silabo_id = envios_biblioteca.revision_silabo_id and envios_biblioteca.verificado_en is not null)
      and not exists (select 1 from aprobaciones where revisiones_silabo.revision_silabo_id = aprobaciones.revision_silabo_id)
      and numero_revision = (select max(latest.numero_revision) from revisiones_silabo latest where latest.silabo_id = revisiones_silabo.silabo_id)
      and ${REVISION_EXISTS})`,
  ]
  if (filters.search !== "") conditions.push(subjectSearch(filters.search))
  return sql.join(conditions, sql` and `)
}

function historyConditions(filters: Pick<HistoryFilters, "careerId">): SQL {
  return sql.join(
    [
      sql`silabos.estado_silabo = 'aprobado'`,
      IN_PAST_PERIOD,
      convocationWhere(sql`convocatoria_filtro.carrera_id = ${filters.careerId}::uuid`),
      sql`exists (select 1 from aprobaciones inner join revisiones_silabo on revisiones_silabo.revision_silabo_id = aprobaciones.revision_silabo_id
        where silabos.silabo_id = revisiones_silabo.silabo_id)`,
      SYLLABUS_EXISTS,
    ],
    sql` and `,
  )
}

type LatestRevision = { syllabus_id: string; id: string; number: number; submitted_at: string; approved: boolean; verified: boolean }

async function latestRevisions(executor: Executor, ids: string[]): Promise<Map<string, LatestRevision>> {
  if (ids.length === 0) return new Map()
  const found = await rowsOf<LatestRevision>(
    executor,
    sql`select distinct on (revisiones_silabo.silabo_id) revisiones_silabo.silabo_id::text as syllabus_id, revisiones_silabo.revision_silabo_id::text as id,
        revisiones_silabo.numero_revision as number, ${iso8601(sql.raw("revisiones_silabo.enviado_en"))} as submitted_at,
        exists (select 1 from aprobaciones where aprobaciones.revision_silabo_id = revisiones_silabo.revision_silabo_id) as approved,
        exists (select 1 from envios_biblioteca where envios_biblioteca.revision_silabo_id = revisiones_silabo.revision_silabo_id and envios_biblioteca.verificado_en is not null) as verified
      from revisiones_silabo where revisiones_silabo.silabo_id in (${uuidList(ids)}) and ${REVISION_EXISTS}
      order by revisiones_silabo.silabo_id, revisiones_silabo.numero_revision desc`,
  )
  return new Map(found.map((row) => [row.syllabus_id, row]))
}

type ApprovedRevision = { syllabus_id: string; id: string; author: string | null; approved_at: string | null }

async function latestApproved(executor: Executor, ids: string[]): Promise<Map<string, ApprovedRevision>> {
  if (ids.length === 0) return new Map()
  const found = await rowsOf<ApprovedRevision>(
    executor,
    sql`select distinct on (revisiones_silabo.silabo_id) revisiones_silabo.silabo_id::text as syllabus_id, revisiones_silabo.revision_silabo_id::text as id,
        (select usuarios.nombre_usuario from usuarios where usuarios.usuario_id = revisiones_silabo.enviado_por) as author,
        (select ${iso8601(sql.raw("aprobaciones.aprobado_en"))} from aprobaciones where aprobaciones.revision_silabo_id = revisiones_silabo.revision_silabo_id limit 1) as approved_at
      from revisiones_silabo where revisiones_silabo.silabo_id in (${uuidList(ids)}) and ${REVISION_EXISTS}
        and exists (select 1 from aprobaciones where aprobaciones.revision_silabo_id = revisiones_silabo.revision_silabo_id)
      order by revisiones_silabo.silabo_id, revisiones_silabo.numero_revision desc`,
  )
  return new Map(found.map((row) => [row.syllabus_id, row]))
}

export async function teacherNamesOf(executor: Executor, ids: string[]): Promise<Map<string, string[]>> {
  const names = new Map<string, string[]>()
  if (ids.length === 0) return names
  const found = await rowsOf<{ syllabus_id: string; name: string }>(
    executor,
    sql`select usuarios.nombre_usuario as name, docentes_vigentes_silabo.silabo_id::text as syllabus_id
      from usuarios inner join docentes_vigentes_silabo on usuarios.usuario_id = docentes_vigentes_silabo.usuario_id
      where docentes_vigentes_silabo.silabo_id in (${uuidList(ids)})`,
  )
  for (const row of found) names.set(row.syllabus_id, [...(names.get(row.syllabus_id) ?? []), row.name])
  return names
}

export function createCoordinationReviewRepository(executor: Executor = db as unknown as Executor): CoordinationReviewRepository {
  return {
    async reviewPage(filters, page, perPage) {
      const where = reviewConditions(filters)
      const [count] = await rowsOf<{ total: string }>(executor, sql`select count(*) as total from silabos where ${where}`)
      const total = Number(count?.total ?? 0)
      if (total === 0) return { total, items: [] }
      const ids = (
        await rowsOf<{ id: string }>(
          executor,
          sql`select silabos.silabo_id::text as id from silabos where ${where} order by guardado_en DESC NULLS LAST limit ${perPage} offset ${(page - 1) * perPage}`,
        )
      ).map((row) => row.id)
      const details = await syllabusDetails(executor, ids)
      const revisions = await latestRevisions(executor, ids)
      const items: ReviewListRow[] = details.map((row) => {
        const revision = revisions.get(row.id) ?? null
        return {
          id: row.id,
          subject: row.subject,
          code: row.code,
          period: row.period,
          state: row.state,
          revisionId: revision?.id ?? null,
          revisionNumber: revision === null ? null : Number(revision.number),
          submittedAt: revision?.submitted_at ?? null,
          approved: revision?.approved ?? false,
          verified: revision?.verified ?? false,
        }
      })
      return { total, items }
    },
    teacherNames: (ids) => teacherNamesOf(executor, ids),
    async historyPage(filters, page, perPage) {
      const conditions: SQL[] = [historyConditions(filters)]
      if (filters.periodId !== null) {
        conditions.push(convocationWhere(sql`exists (select 1 from convocatorias_universidad proceso_periodo
          where proceso_periodo.convocatoria_universidad_id = convocatoria_filtro.convocatoria_universidad_id and proceso_periodo.periodo_academico_id = ${filters.periodId}::uuid)`))
      }
      if (filters.search !== "") conditions.push(subjectSearch(filters.search))
      const where = sql.join(conditions, sql` and `)
      const [count] = await rowsOf<{ total: string }>(executor, sql`select count(*) as total from silabos where ${where}`)
      const total = Number(count?.total ?? 0)
      if (total === 0) return { total, items: [] }
      const ids = (
        await rowsOf<{ id: string }>(
          executor,
          sql`select silabos.silabo_id::text as id from silabos where ${where}
            order by (select pa.fecha_fin_periodo from convocatorias_carreras as cc
                inner join convocatorias_universidad as cu on cu.convocatoria_universidad_id = cc.convocatoria_universidad_id
                inner join periodos_academicos as pa on pa.periodo_academico_id = cu.periodo_academico_id
                where cc.convocatoria_carrera_id = silabos.convocatoria_carrera_id) desc,
              datos_academicos_silabo->'subject'->>'name', datos_academicos_silabo->'parallel'->>'code', silabos.silabo_id asc
            limit ${perPage} offset ${(page - 1) * perPage}`,
        )
      ).map((row) => row.id)
      const details = await syllabusDetails(executor, ids)
      const approved = await latestApproved(executor, ids)
      const items: HistoryRow[] = details.map((row) => {
        const revision = approved.get(row.id) ?? null
        return {
          id: row.id,
          subject: row.subject,
          code: row.code,
          period: row.period,
          parallel: row.parallel,
          revisionId: revision?.id ?? null,
          author: revision?.author ?? null,
          approvedAt: revision?.approved_at ?? null,
        }
      })
      return { total, items }
    },
    async historyPeriods(careerId) {
      return rowsOf<{ id: string; code: string }>(
        executor,
        sql`select periodo_academico_id::text as id, codigo_periodo_academico as code from periodos_academicos
          where periodo_academico_id in (select cu.periodo_academico_id from convocatorias_universidad as cu
            inner join convocatorias_carreras as cc on cc.convocatoria_universidad_id = cu.convocatoria_universidad_id
            where cc.convocatoria_carrera_id in (select silabos.convocatoria_carrera_id from silabos where ${historyConditions({ careerId })}))
          order by fecha_fin_periodo desc`,
      )
    },
    async periodExists(id) {
      const [row] = await rowsOf<{ total: string }>(executor, sql`select count(*) as total from periodos_academicos where periodo_academico_id = ${id}::uuid`)
      return Number(row?.total ?? 0) > 0
    },
    async revision(id) {
      const [row] = await rowsOf<{ id: string; syllabus_id: string; number: number; snapshot: string | null }>(
        executor,
        sql`select revision_silabo_id::text as id, silabo_id::text as syllabus_id, numero_revision as number, contenido_enviado::text as snapshot
          from revisiones_silabo where revision_silabo_id = ${id}::uuid and ${REVISION_EXISTS} limit 1`,
      )
      return row ? { id: row.id, syllabusId: row.syllabus_id, number: Number(row.number), snapshot: phpJsonDecode(row.snapshot) } : null
    },
    syllabus: (id, userId) => syllabusFacts(executor, id, userId),
    async syllabusSummary(id) {
      const [detail] = await syllabusDetails(executor, [id])
      const revisions = await rowsOf<{ id: string; number: number; submitted_at: string }>(
        executor,
        sql`select revision_silabo_id::text as id, numero_revision as number, ${iso8601(sql.raw("enviado_en"))} as submitted_at
          from revisiones_silabo where silabo_id = ${id}::uuid and ${REVISION_EXISTS} order by numero_revision asc`,
      )
      return {
        id,
        subject: detail?.subject ?? "",
        code: detail?.code ?? "",
        period: detail?.period ?? "",
        revisions: revisions.map((row) => ({ id: row.id, number: Number(row.number), submittedAt: row.submitted_at })),
      }
    },
  }
}
