import "server-only"
import { and, asc, desc, eq, exists, inArray, isNotNull, sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { isoText, jsonText } from "@/db/expressions"
import { aprobaciones, convocatoriasCarreras, convocatoriasUniversidad, docentesVigentesSilabo, enviosBiblioteca, periodosAcademicos, revisionesSilabo, silabos, usuarios } from "@/db/schema"
import { phpJsonDecode } from "../configuration/phpValues"
import type { CoordinationReviewRepository, HistoryFilters, HistoryRow, ReviewListRow } from "./coordinationReviews"
import { syllabusFacts } from "./draftFieldStore"
import { careerIs, convocationWhere, IN_CURRENT_PERIOD, IN_PAST_PERIOD, SYLLABUS_EXISTS } from "./syllabusSql"
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
    async reviewPage(filters, page, perPage) {
      const where = reviewConditions(filters)
      const total = await executor.$count(silabos, where)
      if (total === 0) return { total, items: [] }
      const ids = (
        await executor
          .select({ id: silabos.silaboId })
          .from(silabos)
          .where(where)
          .orderBy(sql`${silabos.guardadoEn} desc nulls last`)
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
    async historyPage(filters, page, perPage) {
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
          .orderBy(
            sql`(select pa.fecha_fin_periodo from convocatorias_carreras as cc
                inner join convocatorias_universidad as cu on cu.convocatoria_universidad_id = cc.convocatoria_universidad_id
                inner join periodos_academicos as pa on pa.periodo_academico_id = cu.periodo_academico_id
                where cc.convocatoria_carrera_id = silabos.convocatoria_carrera_id) desc`,
            sql`${silabos.datosAcademicosSilabo}->'subject'->>'name'`,
            sql`${silabos.datosAcademicosSilabo}->'parallel'->>'code'`,
            asc(silabos.silaboId),
          )
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
