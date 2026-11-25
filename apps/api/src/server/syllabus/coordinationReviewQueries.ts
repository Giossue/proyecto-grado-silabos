import { and, asc, desc, eq, exists, inArray, isNotNull, sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { isoText, jsonText } from "@/db/expressions"
import { aprobaciones, convocatoriasCarreras, convocatoriasUniversidad, docentesVigentesSilabo, enviosBiblioteca, periodosAcademicos, revisionesSilabo, silabos, usuarios } from "@/db/schema"
import type { CoordinationHistorySort, CoordinationReviewSort, ListSort } from "@silabos/shared/schemas/listSort"
import { phpJsonDecode } from "../configuration/phpValues"
import type { CoordinationReviewRepository, HistoryFilters, HistoryRow, ReviewListRow } from "./coordinationReviews"
import { syllabusFacts } from "./draftFieldStore"
import { careerIs, convocationWhere, IN_CURRENT_PERIOD, IN_PAST_PERIOD, PARALLEL_CODE, SUBJECT_CODE, SUBJECT_NAME, SYLLABUS_EXISTS } from "./syllabusSql"
import { subjectSearch, syllabusDetails, type Executor } from "./teacherSyllabusQueries"

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

const SUBJECT_OF = (column: SQL): SQL => sql`(select ${column} from paralelos paralelo
  inner join asignaturas asignatura on asignatura.asignatura_id = paralelo.asignatura_id
  where paralelo.paralelo_id = silabos.paralelo_id)`

const REVIEW_SORT_KEYS: Record<CoordinationReviewSort, SQL> = {
  subject: SUBJECT_OF(SUBJECT_NAME),
  teacher: sql`(select min(usuario_docente.nombre_usuario) from docentes_vigentes_silabo docente
    inner join usuarios usuario_docente on usuario_docente.usuario_id = docente.usuario_id
    where docente.silabo_id = silabos.silabo_id)`,
  revision: sql`(select max(revisiones_silabo.numero_revision) from revisiones_silabo
    where revisiones_silabo.silabo_id = silabos.silabo_id and ${REVISION_EXISTS})`,
  submitted: sql`(select revisiones_silabo.enviado_en from revisiones_silabo
    where revisiones_silabo.silabo_id = silabos.silabo_id and ${REVISION_EXISTS}
    order by revisiones_silabo.numero_revision desc limit 1)`,
}

const LATEST_APPROVED = (column: SQL): SQL => sql`(select ${column} from revisiones_silabo
  inner join aprobaciones on aprobaciones.revision_silabo_id = revisiones_silabo.revision_silabo_id
  where revisiones_silabo.silabo_id = silabos.silabo_id and ${REVISION_EXISTS}
  order by revisiones_silabo.numero_revision desc limit 1)`

const HISTORY_SORT_KEYS: Record<CoordinationHistorySort, SQL> = {
  subject: SUBJECT_OF(SUBJECT_NAME),
  code: SUBJECT_OF(SUBJECT_CODE),
  parallel: sql`(select ${PARALLEL_CODE} from paralelos paralelo where paralelo.paralelo_id = silabos.paralelo_id)`,
  author: LATEST_APPROVED(sql`(select usuarios.nombre_usuario from usuarios where usuarios.usuario_id = revisiones_silabo.enviado_por)`),
  approved: LATEST_APPROVED(sql`aprobaciones.aprobado_en`),
}

const SAVED_LAST = sql`${silabos.guardadoEn} desc nulls last`

const PERIOD_END = sql`(select pa.fecha_fin_periodo from convocatorias_carreras as cc
                inner join convocatorias_universidad as cu on cu.convocatoria_universidad_id = cc.convocatoria_universidad_id
                inner join periodos_academicos as pa on pa.periodo_academico_id = cu.periodo_academico_id
                where cc.convocatoria_carrera_id = silabos.convocatoria_carrera_id) desc`

const sortedBy = (key: SQL, sort: NonNullable<ListSort>): SQL => sql`${key} ${sql.raw(sort.direction)} nulls last`

export function reviewOrder(sort: ListSort<CoordinationReviewSort>): SQL[] {
  if (sort === null) return [SAVED_LAST]
  return [sortedBy(REVIEW_SORT_KEYS[sort.column], sort), SAVED_LAST, asc(silabos.silaboId)]
}

export function historyOrder(sort: ListSort<CoordinationHistorySort>): SQL[] {
  const chosen = sort === null ? [] : [sortedBy(HISTORY_SORT_KEYS[sort.column], sort)]
  return [
    PERIOD_END,
    ...chosen,
    sql`${silabos.datosAcademicosSilabo}->'subject'->>'name'`,
    sql`${silabos.datosAcademicosSilabo}->'parallel'->>'code'`,
    asc(silabos.silaboId),
  ]
}

const APPROVED = exists(db.select({ id: aprobaciones.aprobacionId }).from(aprobaciones).where(eq(aprobaciones.revisionSilaboId, revisionesSilabo.revisionSilaboId)))

async function latestRevisions(executor: Executor, ids: string[]) {
  if (ids.length === 0) return new Map()
  const found = await executor
    .selectDistinctOn([revisionesSilabo.silaboId], {
      syllabusId: revisionesSilabo.silaboId,
      id: revisionesSilabo.revisionSilaboId,
      number: revisionesSilabo.numeroRevision,
      submittedAt: isoText(revisionesSilabo.enviadoEn),
      approved: sql<boolean>`${APPROVED}`,
      verified: sql<boolean>`${exists(
        executor
          .select({ id: enviosBiblioteca.envioBibliotecaId })
          .from(enviosBiblioteca)
          .where(and(eq(enviosBiblioteca.revisionSilaboId, revisionesSilabo.revisionSilaboId), isNotNull(enviosBiblioteca.verificadoEn))),
      )}`,
    })
    .from(revisionesSilabo)
    .where(and(inArray(revisionesSilabo.silaboId, ids), REVISION_EXISTS))
    .orderBy(revisionesSilabo.silaboId, desc(revisionesSilabo.numeroRevision))
  return new Map(found.map((row) => [row.syllabusId, row]))
}

async function latestApproved(executor: Executor, ids: string[]) {
  if (ids.length === 0) return new Map()
  const found = await executor
    .selectDistinctOn([revisionesSilabo.silaboId], {
      syllabusId: revisionesSilabo.silaboId,
      id: revisionesSilabo.revisionSilaboId,
      author: sql<string | null>`(${executor.select({ name: usuarios.nombreUsuario }).from(usuarios).where(eq(usuarios.usuarioId, revisionesSilabo.enviadoPor))})`,
      approvedAt: sql<string | null>`(${executor
        .select({ at: isoText(aprobaciones.aprobadoEn) })
        .from(aprobaciones)
        .where(eq(aprobaciones.revisionSilaboId, revisionesSilabo.revisionSilaboId))
        .limit(1)})`,
    })
    .from(revisionesSilabo)
    .where(and(inArray(revisionesSilabo.silaboId, ids), REVISION_EXISTS, APPROVED))
    .orderBy(revisionesSilabo.silaboId, desc(revisionesSilabo.numeroRevision))
  return new Map(found.map((row) => [row.syllabusId, row]))
}

export async function teacherNamesOf(executor: Executor, ids: string[]): Promise<Map<string, string[]>> {
  const names = new Map<string, string[]>()
  if (ids.length === 0) return names
  const found = await executor
    .select({ name: usuarios.nombreUsuario, syllabusId: docentesVigentesSilabo.silaboId })
    .from(usuarios)
    .innerJoin(docentesVigentesSilabo, eq(usuarios.usuarioId, docentesVigentesSilabo.usuarioId))
    .where(inArray(docentesVigentesSilabo.silaboId, ids))
  for (const row of found) names.set(row.syllabusId, [...(names.get(row.syllabusId) ?? []), row.name])
  return names
}

export function createCoordinationReviewRepository(executor: Executor = db): CoordinationReviewRepository {
  return {
    async reviewPage(filters, page, perPage, sort = null) {
      const where = reviewConditions(filters)
      const total = await executor.$count(silabos, where)
      if (total === 0) return { total, items: [] }
      const ids = (
        await executor
          .select({ id: silabos.silaboId })
          .from(silabos)
          .where(where)
          .orderBy(...reviewOrder(sort))
          .limit(perPage)
          .offset((page - 1) * perPage)
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
          submittedAt: revision?.submittedAt ?? null,
          approved: revision?.approved ?? false,
          verified: revision?.verified ?? false,
        }
      })
      return { total, items }
    },
    teacherNames: (ids) => teacherNamesOf(executor, ids),
    async historyPage(filters, page, perPage, sort = null) {
      const conditions: SQL[] = [historyConditions(filters)]
      if (filters.periodId !== null) {
        conditions.push(convocationWhere(sql`exists (select 1 from convocatorias_universidad proceso_periodo
          where proceso_periodo.convocatoria_universidad_id = convocatoria_filtro.convocatoria_universidad_id and proceso_periodo.periodo_academico_id = ${filters.periodId}::uuid)`))
      }
      if (filters.search !== "") conditions.push(subjectSearch(filters.search))
      const where = sql.join(conditions, sql` and `)
      const total = await executor.$count(silabos, where)
      if (total === 0) return { total, items: [] }
      const ids = (
        await executor
          .select({ id: silabos.silaboId })
          .from(silabos)
          .where(where)
          .orderBy(...historyOrder(sort))
          .limit(perPage)
          .offset((page - 1) * perPage)
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
          approvedAt: revision?.approvedAt ?? null,
        }
      })
      return { total, items }
    },
    historyPeriods: (careerId) =>
      executor
        .select({ id: periodosAcademicos.periodoAcademicoId, code: periodosAcademicos.codigoPeriodoAcademico })
        .from(periodosAcademicos)
        .where(
          inArray(
            periodosAcademicos.periodoAcademicoId,
            executor
              .select({ id: convocatoriasUniversidad.periodoAcademicoId })
              .from(convocatoriasUniversidad)
              .innerJoin(convocatoriasCarreras, eq(convocatoriasCarreras.convocatoriaUniversidadId, convocatoriasUniversidad.convocatoriaUniversidadId))
              .where(
                inArray(
                  convocatoriasCarreras.convocatoriaCarreraId,
                  executor.select({ id: silabos.convocatoriaCarreraId }).from(silabos).where(historyConditions({ careerId })),
                ),
              ),
          ),
        )
        .orderBy(desc(periodosAcademicos.fechaFinPeriodo)),
    periodExists: async (id) => (await executor.$count(periodosAcademicos, eq(periodosAcademicos.periodoAcademicoId, id))) > 0,
    async revision(id) {
      const [row] = await executor
        .select({
          id: revisionesSilabo.revisionSilaboId,
          syllabusId: revisionesSilabo.silaboId,
          number: revisionesSilabo.numeroRevision,
          snapshot: jsonText(revisionesSilabo.contenidoEnviado),
        })
        .from(revisionesSilabo)
        .where(and(eq(revisionesSilabo.revisionSilaboId, id), REVISION_EXISTS))
        .limit(1)
      return row ? { id: row.id, syllabusId: row.syllabusId, number: Number(row.number), snapshot: phpJsonDecode(row.snapshot) } : null
    },
    syllabus: (id, userId) => syllabusFacts(executor, id, userId),
    async syllabusSummary(id) {
      const [detail] = await syllabusDetails(executor, [id])
      const revisions = await executor
        .select({ id: revisionesSilabo.revisionSilaboId, number: revisionesSilabo.numeroRevision, submitted_at: isoText(revisionesSilabo.enviadoEn) })
        .from(revisionesSilabo)
        .where(and(eq(revisionesSilabo.silaboId, id), REVISION_EXISTS))
        .orderBy(asc(revisionesSilabo.numeroRevision))
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
