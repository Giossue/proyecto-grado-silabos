import "server-only"
import { and, desc, eq, exists, inArray, isNotNull, sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { aprobaciones, carreras, convocatoriasCarreras, convocatoriasUniversidad, enviosBiblioteca, periodosAcademicos, revisionesSilabo, silabos } from "@/db/schema"
import { careerLabelSql } from "../academic/careerLabel"
import { accentMatches, institutionDateSql } from "../http/sql"
import type { ConvocationListFilters, ConvocationRepository, ConvocationTx, ProcessListRow } from "./convocations"
import { teacherNamesOf } from "./coordinationReviewQueries"
import { careerIs, SYLLABUS_EXISTS } from "./syllabusSql"
import { syllabusDetails, type Executor } from "./teacherSyllabusQueries"

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
      const [row] = await executor
        .select({ state: convocatoriasCarreras.estadoConvocatoriaCarrera })
        .from(convocatoriasCarreras)
        .where(and(eq(convocatoriasCarreras.convocatoriaCarreraId, id), PROCESS_OF_CONVOCATION))
        .limit(1)
        .for("update")
      return row?.state ?? null
    },
    async updateState(id, state) {
      await executor.update(convocatoriasCarreras).set({ estadoConvocatoriaCarrera: state }).where(eq(convocatoriasCarreras.convocatoriaCarreraId, id))
    },
  }
}

export function convocationRepositoryOn(executor: Executor, transaction: <T>(work: (tx: ConvocationTx) => Promise<T>) => Promise<T>): ConvocationRepository {
  return {
    async page(filters, page, perPage) {
      const where = listConditions(filters)
      const total = await executor.$count(convocatoriasUniversidad, where)
      if (total === 0) return { total, items: [] }
      const processes = await executor
        .select({ id: convocatoriasUniversidad.convocatoriaUniversidadId, state: convocatoriasUniversidad.estadoConvocatoriaUniversidad, period: periodosAcademicos.codigoPeriodoAcademico })
        .from(convocatoriasUniversidad)
        .leftJoin(periodosAcademicos, eq(periodosAcademicos.periodoAcademicoId, convocatoriasUniversidad.periodoAcademicoId))
        .where(where)
        .orderBy(desc(convocatoriasUniversidad.fechaInicio))
        .limit(perPage)
        .offset((page - 1) * perPage)
      const convocations =
        processes.length === 0
          ? []
          : await executor
              .select({
                processId: convocatoriasCarreras.convocatoriaUniversidadId,
                id: convocatoriasCarreras.convocatoriaCarreraId,
                state: convocatoriasCarreras.estadoConvocatoriaCarrera,
                syllabiCount: executor.$count(silabos, and(eq(convocatoriasCarreras.convocatoriaCarreraId, silabos.convocatoriaCarreraId), SYLLABUS_EXISTS)),
              })
              .from(convocatoriasCarreras)
              .where(
                and(
                  inArray(
                    convocatoriasCarreras.convocatoriaUniversidadId,
                    processes.map((row) => row.id),
                  ),
                  careerIs(sql`${convocatoriasCarreras.carreraId}`, filters.careerId),
                  PROCESS_OF_CONVOCATION,
                ),
              )
      const items: ProcessListRow[] = processes.map((process) => {
        const convocation = convocations.find((row) => row.processId === process.id) ?? null
        return {
          processId: process.id,
          processState: process.state,
          period: process.period as string,
          convocationId: convocation?.id ?? null,
          convocationState: convocation?.state ?? null,
          syllabiCount: convocation === null ? 0 : Number(convocation.syllabiCount),
        }
      })
      return { total, items }
    },
    async convocation(id) {
      const [row] = await executor
        .select({
          id: convocatoriasCarreras.convocatoriaCarreraId,
          careerId: convocatoriasCarreras.carreraId,
          career: sql<string>`${careerLabelSql("carreras")}`,
          state: convocatoriasCarreras.estadoConvocatoriaCarrera,
          processState: convocatoriasUniversidad.estadoConvocatoriaUniversidad,
          period: periodosAcademicos.codigoPeriodoAcademico,
          startsOn: sql<string>`${institutionDateSql(sql`${convocatoriasUniversidad.fechaInicio}`)}`,
          dueOn: sql<string>`${institutionDateSql(sql`${convocatoriasUniversidad.fechaEntrega}`)}`,
        })
        .from(convocatoriasCarreras)
        .innerJoin(convocatoriasUniversidad, eq(convocatoriasUniversidad.convocatoriaUniversidadId, convocatoriasCarreras.convocatoriaUniversidadId))
        .innerJoin(periodosAcademicos, eq(periodosAcademicos.periodoAcademicoId, convocatoriasUniversidad.periodoAcademicoId))
        .innerJoin(carreras, eq(carreras.carreraId, convocatoriasCarreras.carreraId))
        .where(eq(convocatoriasCarreras.convocatoriaCarreraId, id))
        .limit(1)
      return row ?? null
    },
    async syllabi(convocationId) {
      const ids = (
        await executor
          .select({ id: silabos.silaboId })
          .from(silabos)
          .where(and(eq(silabos.convocatoriaCarreraId, convocationId), isNotNull(silabos.convocatoriaCarreraId), SYLLABUS_EXISTS))
      ).map((row) => row.id)
      if (ids.length === 0) return []
      const details = await syllabusDetails(executor, ids)
      const revisions = await executor
        .selectDistinctOn([revisionesSilabo.silaboId], {
          syllabusId: revisionesSilabo.silaboId,
          id: revisionesSilabo.revisionSilaboId,
          stage: revisionesSilabo.correccionEtapa,
          approved: sql<boolean>`${exists(executor.select({ id: aprobaciones.aprobacionId }).from(aprobaciones).where(eq(aprobaciones.revisionSilaboId, revisionesSilabo.revisionSilaboId)))}`,
          verified: sql<boolean>`${exists(
            executor
              .select({ id: enviosBiblioteca.envioBibliotecaId })
              .from(enviosBiblioteca)
              .where(and(eq(enviosBiblioteca.revisionSilaboId, revisionesSilabo.revisionSilaboId), isNotNull(enviosBiblioteca.verificadoEn))),
          )}`,
        })
        .from(revisionesSilabo)
        .where(inArray(revisionesSilabo.silaboId, ids))
        .orderBy(revisionesSilabo.silaboId, desc(revisionesSilabo.numeroRevision))
      const latest = new Map(revisions.map((row) => [row.syllabusId, row]))
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
  return convocationRepositoryOn(db, (work) => db.transaction((tx) => work(convocationTx(tx))))
}

export { convocationTx }
