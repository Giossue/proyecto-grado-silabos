import { Prisma } from "../../generated/prisma/client"
import { isoText, uuidList } from "../../prisma/sql"
import type { CoordinationHistorySort, CoordinationReviewSort, ListSort } from "@silabos/shared/schemas/listSort"
import { phpJsonDecode } from "../configuration/phpValues"
import type { CoordinationReviewRepository, HistoryFilters, HistoryRow, ReviewListRow } from "./coordinationReviews"
import { syllabusFacts } from "./draftFieldStore"
import { careerIs, convocationWhere, IN_CURRENT_PERIOD, IN_PAST_PERIOD, PARALLEL_CODE, SUBJECT_CODE, SUBJECT_NAME, SYLLABUS_EXISTS } from "./syllabusSql"
import { rowsOf, subjectSearch, syllabusDetails, type Executor } from "./teacherSyllabusQueries"

const REVISION_EXISTS = Prisma.sql`exists (select 1 from silabos silabo_revision where silabo_revision.silabo_id = revisiones_silabo.silabo_id
  and exists (select 1 from convocatorias_carreras convocatoria_revision where convocatoria_revision.convocatoria_carrera_id = silabo_revision.convocatoria_carrera_id
    and exists (select 1 from convocatorias_universidad proceso_revision where proceso_revision.convocatoria_universidad_id = convocatoria_revision.convocatoria_universidad_id)))`

export function reviewConditions(filters: { careerId: string | null; search: string }): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    convocationWhere(careerIs(Prisma.raw("convocatoria_filtro.carrera_id"), filters.careerId)),
    Prisma.sql`exists (select 1 from revisiones_silabo where silabos.silabo_id = revisiones_silabo.silabo_id and ${REVISION_EXISTS})`,
    IN_CURRENT_PERIOD,
    SYLLABUS_EXISTS,
    Prisma.sql`silabos.estado_silabo = 'en_revision'`,
    Prisma.sql`exists (select 1 from revisiones_silabo where silabos.silabo_id = revisiones_silabo.silabo_id
      and exists (select 1 from envios_biblioteca where revisiones_silabo.revision_silabo_id = envios_biblioteca.revision_silabo_id and envios_biblioteca.verificado_en is not null)
      and not exists (select 1 from aprobaciones where revisiones_silabo.revision_silabo_id = aprobaciones.revision_silabo_id)
      and numero_revision = (select max(latest.numero_revision) from revisiones_silabo latest where latest.silabo_id = revisiones_silabo.silabo_id)
      and ${REVISION_EXISTS})`,
  ]
  if (filters.search !== "") conditions.push(subjectSearch(filters.search))
  return Prisma.join(conditions, " and ")
}

function historyConditions(filters: Pick<HistoryFilters, "careerId">): Prisma.Sql {
  return Prisma.join(
    [
      Prisma.sql`silabos.estado_silabo = 'aprobado'`,
      IN_PAST_PERIOD,
      convocationWhere(Prisma.sql`convocatoria_filtro.carrera_id = ${filters.careerId}::uuid`),
      Prisma.sql`exists (select 1 from aprobaciones inner join revisiones_silabo on revisiones_silabo.revision_silabo_id = aprobaciones.revision_silabo_id
        where silabos.silabo_id = revisiones_silabo.silabo_id)`,
      SYLLABUS_EXISTS,
    ],
    " and ",
  )
}

const SUBJECT_OF = (column: Prisma.Sql): Prisma.Sql => Prisma.sql`(select ${column} from paralelos paralelo
  inner join asignaturas asignatura on asignatura.asignatura_id = paralelo.asignatura_id
  where paralelo.paralelo_id = silabos.paralelo_id)`

const REVIEW_SORT_KEYS: Record<CoordinationReviewSort, Prisma.Sql> = {
  subject: SUBJECT_OF(SUBJECT_NAME),
  teacher: Prisma.sql`(select min(usuario_docente.nombre_usuario) from docentes_vigentes_silabo docente
    inner join usuarios usuario_docente on usuario_docente.usuario_id = docente.usuario_id
    where docente.silabo_id = silabos.silabo_id)`,
  revision: Prisma.sql`(select max(revisiones_silabo.numero_revision) from revisiones_silabo
    where revisiones_silabo.silabo_id = silabos.silabo_id and ${REVISION_EXISTS})`,
  submitted: Prisma.sql`(select revisiones_silabo.enviado_en from revisiones_silabo
    where revisiones_silabo.silabo_id = silabos.silabo_id and ${REVISION_EXISTS}
    order by revisiones_silabo.numero_revision desc limit 1)`,
}

const LATEST_APPROVED = (column: Prisma.Sql): Prisma.Sql => Prisma.sql`(select ${column} from revisiones_silabo
  inner join aprobaciones on aprobaciones.revision_silabo_id = revisiones_silabo.revision_silabo_id
  where revisiones_silabo.silabo_id = silabos.silabo_id and ${REVISION_EXISTS}
  order by revisiones_silabo.numero_revision desc limit 1)`

const HISTORY_SORT_KEYS: Record<CoordinationHistorySort, Prisma.Sql> = {
  subject: SUBJECT_OF(SUBJECT_NAME),
  code: SUBJECT_OF(SUBJECT_CODE),
  parallel: Prisma.sql`(select ${PARALLEL_CODE} from paralelos paralelo where paralelo.paralelo_id = silabos.paralelo_id)`,
  author: LATEST_APPROVED(Prisma.sql`(select usuarios.nombre_usuario from usuarios where usuarios.usuario_id = revisiones_silabo.enviado_por)`),
  approved: LATEST_APPROVED(Prisma.sql`aprobaciones.aprobado_en`),
}

const SILABO_ID_ASC = Prisma.sql`"silabos"."silabo_id" asc`

const SAVED_LAST = Prisma.sql`"silabos"."guardado_en" desc nulls last`

const PERIOD_END = Prisma.sql`(select pa.fecha_fin_periodo from convocatorias_carreras as cc
                inner join convocatorias_universidad as cu on cu.convocatoria_universidad_id = cc.convocatoria_universidad_id
                inner join periodos_academicos as pa on pa.periodo_academico_id = cu.periodo_academico_id
                where cc.convocatoria_carrera_id = silabos.convocatoria_carrera_id) desc`

const sortedBy = (key: Prisma.Sql, sort: NonNullable<ListSort>): Prisma.Sql => Prisma.sql`${key} ${Prisma.raw(sort.direction)} nulls last`

export function reviewOrder(sort: ListSort<CoordinationReviewSort>): Prisma.Sql[] {
  if (sort === null) return [SAVED_LAST]
  return [sortedBy(REVIEW_SORT_KEYS[sort.column], sort), SAVED_LAST, SILABO_ID_ASC]
}

export function historyOrder(sort: ListSort<CoordinationHistorySort>): Prisma.Sql[] {
  const chosen = sort === null ? [] : [sortedBy(HISTORY_SORT_KEYS[sort.column], sort)]
  return [
    PERIOD_END,
    ...chosen,
    Prisma.sql`"silabos"."datos_academicos_silabo"->'subject'->>'name'`,
    Prisma.sql`"silabos"."datos_academicos_silabo"->'parallel'->>'code'`,
    SILABO_ID_ASC,
  ]
}

const APPROVED = Prisma.sql`exists (select "aprobacion_id" from "aprobaciones" where "aprobaciones"."revision_silabo_id" = "revisiones_silabo"."revision_silabo_id")`

type LatestRevision = { syllabusId: string; id: string; number: number; submittedAt: string; approved: boolean; verified: boolean }
type LatestApproved = { syllabusId: string; id: string; author: string | null; approvedAt: string | null }

async function latestRevisions(executor: Executor, ids: string[]): Promise<Map<string, LatestRevision>> {
  if (ids.length === 0) return new Map()
  const found = await rowsOf<LatestRevision>(
    executor,
    Prisma.sql`select distinct on ("revisiones_silabo"."silabo_id") "revisiones_silabo"."silabo_id"::text as "syllabusId", "revisiones_silabo"."revision_silabo_id"::text as id,
      "revisiones_silabo"."numero_revision" as number, ${isoText(Prisma.raw('"revisiones_silabo"."enviado_en"'))} as "submittedAt", ${APPROVED} as approved,
      exists (select "envio_biblioteca_id" from "envios_biblioteca" where ("envios_biblioteca"."revision_silabo_id" = "revisiones_silabo"."revision_silabo_id" and "envios_biblioteca"."verificado_en" is not null)) as verified
    from "revisiones_silabo"
    where ("revisiones_silabo"."silabo_id" in (${uuidList(ids)}) and ${REVISION_EXISTS})
    order by "revisiones_silabo"."silabo_id", "revisiones_silabo"."numero_revision" desc`,
  )
  return new Map(found.map((row) => [row.syllabusId, row]))
}

async function latestApproved(executor: Executor, ids: string[]): Promise<Map<string, LatestApproved>> {
  if (ids.length === 0) return new Map()
  const found = await rowsOf<LatestApproved>(
    executor,
    Prisma.sql`select distinct on ("revisiones_silabo"."silabo_id") "revisiones_silabo"."silabo_id"::text as "syllabusId", "revisiones_silabo"."revision_silabo_id"::text as id,
      (select "nombre_usuario" from "usuarios" where "usuarios"."usuario_id" = "revisiones_silabo"."enviado_por") as author,
      (select ${isoText(Prisma.raw('"aprobaciones"."aprobado_en"'))} from "aprobaciones" where "aprobaciones"."revision_silabo_id" = "revisiones_silabo"."revision_silabo_id" limit 1) as "approvedAt"
    from "revisiones_silabo"
    where ("revisiones_silabo"."silabo_id" in (${uuidList(ids)}) and ${REVISION_EXISTS} and ${APPROVED})
    order by "revisiones_silabo"."silabo_id", "revisiones_silabo"."numero_revision" desc`,
  )
  return new Map(found.map((row) => [row.syllabusId, row]))
}

export async function teacherNamesOf(executor: Executor, ids: string[]): Promise<Map<string, string[]>> {
  const names = new Map<string, string[]>()
  if (ids.length === 0) return names
  const found = await rowsOf<{ name: string; syllabusId: string }>(
    executor,
    Prisma.sql`select "usuarios"."nombre_usuario" as name, "docentes_vigentes_silabo"."silabo_id"::text as "syllabusId"
    from "usuarios" inner join "docentes_vigentes_silabo" on "usuarios"."usuario_id" = "docentes_vigentes_silabo"."usuario_id"
    where "docentes_vigentes_silabo"."silabo_id" in (${uuidList(ids)})`,
  )
  for (const row of found) names.set(row.syllabusId, [...(names.get(row.syllabusId) ?? []), row.name])
  return names
}

async function countSyllabi(executor: Executor, where: Prisma.Sql): Promise<number> {
  const [row] = await rowsOf<{ count: bigint }>(executor, Prisma.sql`select count(*) as count from "silabos" where ${where}`)
  return Number(row?.count ?? 0)
}

async function pageIds(executor: Executor, where: Prisma.Sql, order: Prisma.Sql[], page: number, perPage: number): Promise<string[]> {
  const rows = await rowsOf<{ id: string }>(
    executor,
    Prisma.sql`select "silabos"."silabo_id"::text as id from "silabos" where ${where} order by ${Prisma.join(order, ", ")} limit ${perPage} offset ${(page - 1) * perPage}`,
  )
  return rows.map((row) => row.id)
}

export function createCoordinationReviewRepository(executor: Executor): CoordinationReviewRepository {
  return {
    async reviewPage(filters, page, perPage, sort = null) {
      const where = reviewConditions(filters)
      const total = await countSyllabi(executor, where)
      if (total === 0) return { total, items: [] }
      const ids = await pageIds(executor, where, reviewOrder(sort), page, perPage)
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
          submittedAt: revision?.submittedAt ?? null,
          approved: revision?.approved ?? false,
          verified: revision?.verified ?? false,
        }
      })
      return { total, items }
    },
    teacherNames: (ids) => teacherNamesOf(executor, ids),
    async historyPage(filters, page, perPage, sort = null) {
      const conditions: Prisma.Sql[] = [historyConditions(filters)]
      if (filters.periodId !== null) {
        conditions.push(convocationWhere(Prisma.sql`exists (select 1 from convocatorias_universidad proceso_periodo
          where proceso_periodo.convocatoria_universidad_id = convocatoria_filtro.convocatoria_universidad_id and proceso_periodo.periodo_academico_id = ${filters.periodId}::uuid)`))
      }
      if (filters.search !== "") conditions.push(subjectSearch(filters.search))
      const where = Prisma.join(conditions, " and ")
      const total = await countSyllabi(executor, where)
      if (total === 0) return { total, items: [] }
      const ids = await pageIds(executor, where, historyOrder(sort), page, perPage)
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
          approvedAt: revision?.approvedAt ?? null,
        }
      })
      return { total, items }
    },
    historyPeriods: (careerId) =>
      rowsOf<{ id: string; code: string }>(
        executor,
        Prisma.sql`select "periodo_academico_id"::text as id, "codigo_periodo_academico" as code from "periodos_academicos"
        where "periodos_academicos"."periodo_academico_id" in (select "convocatorias_universidad"."periodo_academico_id" from "convocatorias_universidad"
          inner join "convocatorias_carreras" on "convocatorias_carreras"."convocatoria_universidad_id" = "convocatorias_universidad"."convocatoria_universidad_id"
          where "convocatorias_carreras"."convocatoria_carrera_id" in (select "convocatoria_carrera_id" from "silabos" where ${historyConditions({ careerId })}))
        order by "periodos_academicos"."fecha_fin_periodo" desc`,
      ),
    periodExists: async (id) => {
      const [row] = await rowsOf<{ count: bigint }>(executor, Prisma.sql`select count(*) as count from "periodos_academicos" where "periodos_academicos"."periodo_academico_id" = ${id}::uuid`)
      return Number(row?.count ?? 0) > 0
    },
    async revision(id) {
      const [row] = await rowsOf<{ id: string; syllabusId: string; number: number; snapshot: string | null }>(
        executor,
        Prisma.sql`select "revision_silabo_id"::text as id, "silabo_id"::text as "syllabusId", "numero_revision" as number, "contenido_enviado"::text as snapshot
        from "revisiones_silabo" where ("revisiones_silabo"."revision_silabo_id" = ${id}::uuid and ${REVISION_EXISTS}) limit 1`,
      )
      return row ? { id: row.id, syllabusId: row.syllabusId, number: Number(row.number), snapshot: phpJsonDecode(row.snapshot) } : null
    },
    syllabus: (id, userId) => syllabusFacts(executor, id, userId),
    async syllabusSummary(id) {
      const [detail] = await syllabusDetails(executor, [id])
      const revisions = await rowsOf<{ id: string; number: number; submitted_at: string }>(
        executor,
        Prisma.sql`select "revision_silabo_id"::text as id, "numero_revision" as number, ${isoText(Prisma.raw('"revisiones_silabo"."enviado_en"'))} as submitted_at
        from "revisiones_silabo" where ("revisiones_silabo"."silabo_id" = ${id}::uuid and ${REVISION_EXISTS})
        order by "revisiones_silabo"."numero_revision" asc`,
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
