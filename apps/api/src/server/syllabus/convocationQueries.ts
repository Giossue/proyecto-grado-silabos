import { Prisma } from "../../generated/prisma/client"
import { inTransaction, type Db } from "../../prisma/db"
import type { PrismaService } from "../../prisma/prisma.service"
import { accentMatches, institutionDateSql, uuidList } from "../../prisma/sql"
import type { ConvocationListFilters, ConvocationRepository, ConvocationTx, ProcessListRow } from "./convocations"
import { teacherNamesOf } from "./coordinationReviewQueries"
import { careerIs, careerLabelSql, SYLLABUS_EXISTS } from "./syllabusSql"
import { rowsOf, syllabusDetails } from "./teacherSyllabusQueries"

const PROCESS_OF_CONVOCATION = Prisma.sql`exists (select 1 from convocatorias_universidad proceso_vigente
  where proceso_vigente.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id)`

function careerConvocation(careerId: string | null, extra: Prisma.Sql = Prisma.empty): Prisma.Sql {
  return Prisma.sql`exists (select 1 from convocatorias_carreras where convocatorias_universidad.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id
    and ${careerIs(Prisma.raw("convocatorias_carreras.carrera_id"), careerId)} ${extra} and ${PROCESS_OF_CONVOCATION})`
}

function listConditions(filters: ConvocationListFilters): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`1 = 1`]
  if (filters.search !== null) {
    conditions.push(Prisma.sql`exists (select 1 from periodos_academicos where convocatorias_universidad.periodo_academico_id = periodos_academicos.periodo_academico_id
      and ${accentMatches(Prisma.raw("codigo_periodo_academico"), filters.search)})`)
  }
  if (filters.state === "sin_iniciar") conditions.push(Prisma.sql`not ${careerConvocation(filters.careerId)}`)
  else if (filters.state !== null) conditions.push(careerConvocation(filters.careerId, Prisma.sql`and convocatorias_carreras.estado_convocatoria_carrera = ${filters.state}`))
  return Prisma.join(conditions, " and ")
}

type ProcessPageRow = { id: string; state: string; period: string | null }
type CareerConvocationRow = { processId: string; id: string; state: string; syllabiCount: bigint }
type LatestRevisionRow = { syllabusId: string; id: string; stage: string | null; approved: boolean; verified: boolean }

function convocationTx(executor: Db): ConvocationTx {
  return {
    async lockConvocation(id) {
      const [row] = await rowsOf<{ state: string }>(
        executor,
        Prisma.sql`select convocatorias_carreras.estado_convocatoria_carrera as state from convocatorias_carreras
          where (convocatorias_carreras.convocatoria_carrera_id = ${id}::uuid and ${PROCESS_OF_CONVOCATION}) limit 1 for update`,
      )
      return row?.state ?? null
    },
    async updateState(id, state) {
      await executor.$executeRaw`update convocatorias_carreras set estado_convocatoria_carrera = ${state} where convocatorias_carreras.convocatoria_carrera_id = ${id}::uuid`
    },
  }
}

export function convocationRepositoryOn(executor: Db, transaction: <T>(work: (tx: ConvocationTx) => Promise<T>) => Promise<T>): ConvocationRepository {
  return {
    async page(filters, page, perPage) {
      const where = listConditions(filters)
      const [count] = await rowsOf<{ total: bigint }>(executor, Prisma.sql`select count(*) as total from convocatorias_universidad where ${where}`)
      const total = Number(count?.total ?? 0)
      if (total === 0) return { total, items: [] }
      const processes = await rowsOf<ProcessPageRow>(
        executor,
        Prisma.sql`select convocatorias_universidad.convocatoria_universidad_id::text as id, convocatorias_universidad.estado_convocatoria_universidad as state,
            periodos_academicos.codigo_periodo_academico as period
          from convocatorias_universidad left join periodos_academicos on periodos_academicos.periodo_academico_id = convocatorias_universidad.periodo_academico_id
          where ${where} order by convocatorias_universidad.fecha_inicio desc limit ${perPage} offset ${(page - 1) * perPage}`,
      )
      const convocations =
        processes.length === 0
          ? []
          : await rowsOf<CareerConvocationRow>(
              executor,
              Prisma.sql`select convocatorias_carreras.convocatoria_universidad_id::text as "processId", convocatorias_carreras.convocatoria_carrera_id::text as id,
                  convocatorias_carreras.estado_convocatoria_carrera as state,
                  (select count(*) from silabos where (convocatorias_carreras.convocatoria_carrera_id = silabos.convocatoria_carrera_id and ${SYLLABUS_EXISTS})) as "syllabiCount"
                from convocatorias_carreras
                where (convocatorias_carreras.convocatoria_universidad_id in (${uuidList(processes.map((row) => row.id))})
                  and ${careerIs(Prisma.raw("convocatorias_carreras.carrera_id"), filters.careerId)} and ${PROCESS_OF_CONVOCATION})`,
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
      const [row] = await rowsOf<{ id: string; careerId: string; career: string; state: string; processState: string; period: string; startsOn: string; dueOn: string }>(
        executor,
        Prisma.sql`select convocatorias_carreras.convocatoria_carrera_id::text as id, convocatorias_carreras.carrera_id::text as "careerId", ${careerLabelSql("carreras")} as career,
            convocatorias_carreras.estado_convocatoria_carrera as state, convocatorias_universidad.estado_convocatoria_universidad as "processState",
            periodos_academicos.codigo_periodo_academico as period,
            ${institutionDateSql(Prisma.raw("convocatorias_universidad.fecha_inicio"))} as "startsOn",
            ${institutionDateSql(Prisma.raw("convocatorias_universidad.fecha_entrega"))} as "dueOn"
          from convocatorias_carreras
          inner join convocatorias_universidad on convocatorias_universidad.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id
          inner join periodos_academicos on periodos_academicos.periodo_academico_id = convocatorias_universidad.periodo_academico_id
          inner join carreras on carreras.carrera_id = convocatorias_carreras.carrera_id
          where convocatorias_carreras.convocatoria_carrera_id = ${id}::uuid limit 1`,
      )
      return row ?? null
    },
    async syllabi(convocationId) {
      const ids = (
        await rowsOf<{ id: string }>(
          executor,
          Prisma.sql`select silabos.silabo_id::text as id from silabos
            where (silabos.convocatoria_carrera_id = ${convocationId}::uuid and silabos.convocatoria_carrera_id is not null and ${SYLLABUS_EXISTS})`,
        )
      ).map((row) => row.id)
      if (ids.length === 0) return []
      const details = await syllabusDetails(executor, ids)
      const revisions = await rowsOf<LatestRevisionRow>(
        executor,
        Prisma.sql`select distinct on (revisiones_silabo.silabo_id) revisiones_silabo.silabo_id::text as "syllabusId", revisiones_silabo.revision_silabo_id::text as id,
            revisiones_silabo.correccion_etapa as stage,
            exists (select aprobaciones.aprobacion_id from aprobaciones where aprobaciones.revision_silabo_id = revisiones_silabo.revision_silabo_id) as approved,
            exists (select envios_biblioteca.envio_biblioteca_id from envios_biblioteca
              where (envios_biblioteca.revision_silabo_id = revisiones_silabo.revision_silabo_id and envios_biblioteca.verificado_en is not null)) as verified
          from revisiones_silabo where revisiones_silabo.silabo_id in (${uuidList(ids)})
          order by revisiones_silabo.silabo_id, revisiones_silabo.numero_revision desc`,
      )
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

export function createConvocationRepository(prisma: PrismaService): ConvocationRepository {
  return convocationRepositoryOn(prisma, (work) => inTransaction(prisma, (tx) => work(convocationTx(tx))))
}

export { convocationTx }
